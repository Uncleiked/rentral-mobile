import { AppState } from 'react-native'
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { router, useRootNavigationState } from 'expo-router'
import type { z } from 'zod'
import type { pushDeviceSchema } from '../../../../lib/push/policy'
import { useAuth } from './AuthProvider'
import { api, errorMessage } from '../lib/api'
import { memberResponse } from '../lib/member-api'
import { pushCapabilitySchema, registerPushInstallation, revokePushInstallation } from '../lib/push-api'
import { pushGate, type PushCapability } from '../lib/push-capability'
import { ensurePushInstallation, loadPushInstallation, resetPushInstallation } from '../lib/push-installation'
import { pushRuntime } from '../lib/push-runtime'
import { clearPushRecovery, loadPushRecovery, savePushRecovery, type PushRecovery } from '../lib/push-recovery'
import { beforeSignOut } from '../lib/sign-out-effects'
import { revokePushBeforeLogout } from '../lib/push-logout'

type Device = z.infer<typeof pushDeviceSchema>
type Snapshot = { actorId: string; capability: PushCapability; installationId: string | null; recovery: PushRecovery | null; recoveryError: string | null; proofError: string | null; permission: { granted: boolean; canAskAgain: boolean } | null }
type PushContextValue = { data: Snapshot | null; error: string | null; message: string | null; busy: boolean; reviewed: boolean; gate: ReturnType<typeof pushGate>; refresh: (review?: boolean) => Promise<Snapshot>; enable: () => Promise<void>; revoke: (id: string) => Promise<void>; dismissRecovery: () => Promise<void>; resetProof: () => Promise<void> }
const PushContext = createContext<PushContextValue | null>(null)
export function PushProvider({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth(), actorId = session?.user.id ?? ''
  const navigation = useRootNavigationState()
  const actor = useRef(actorId), epoch = useRef(0), paused = useRef<string | null>(null), pending = useRef(false), request = useRef<AbortController | null>(null)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [feedback, setFeedback] = useState<{ actorId: string; error: string | null; message: string | null } | null>(null)
  const [busy, setBusy] = useState(false), [reviewed, setReviewed] = useState<{ actorId: string; capability: PushCapability } | null>(null), [tapped, setTapped] = useState(0)
  const handledTap = useRef(0), maintenance = useRef<(() => Promise<void>) | null>(null)
  const confirmedToken = useRef<{ actorId: string; installationId: string; token: string; deviceId: string; updatedAt: string } | null>(null)
  const current = snapshot?.actorId === actorId ? snapshot : null
  const currentFeedback = feedback?.actorId === actorId ? feedback : null
  const gate = pushGate(pushRuntime.build, current?.capability ?? null)
  const isReviewed = reviewed?.actorId === actorId && reviewed.capability === current?.capability
  useLayoutEffect(() => { actor.current = actorId; epoch.current++; paused.current = null; confirmedToken.current = null; request.current?.abort() }, [actorId])
  const usable = (captured: string, started: number) => actor.current === captured && epoch.current === started && paused.current !== captured

  const refresh = useCallback(async (review = false): Promise<Snapshot> => {
    if (!actorId) throw new Error('Sign in before reviewing push registrations.')
    const started = epoch.current
    const [remote, proof, recovery] = await Promise.allSettled([
      api<unknown>('/push', { expectedUserId: actorId }).then(value => memberResponse(pushCapabilitySchema, value)),
      loadPushInstallation(), loadPushRecovery(actorId),
    ])
    if (remote.status === 'rejected') {
      if (actor.current === actorId && epoch.current === started) setFeedback({ actorId, error: errorMessage(remote.reason), message: null })
      throw remote.reason
    }
    const next: Snapshot = { actorId, capability: remote.value, installationId: proof.status === 'fulfilled' ? proof.value?.installationId ?? null : null,
      proofError: proof.status === 'rejected' ? errorMessage(proof.reason) : null, recovery: recovery.status === 'fulfilled' ? recovery.value : null,
      recoveryError: recovery.status === 'rejected' ? errorMessage(recovery.reason) : null, permission: null }
    if (pushGate(pushRuntime.build, next.capability).allowed) {
      try { next.permission = await pushRuntime.permission() } catch { /* Permission status remains unavailable, never guessed as granted. */ }
    }
    if (actor.current === actorId && epoch.current === started && paused.current !== actorId) {
      if (next.recovery?.operation === 'revoke') {
        const previous = next.capability.devices.find(device => next.recovery?.deviceId ? device.id === next.recovery.deviceId : device.installationId === next.recovery?.installationId)
        if (!previous || previous.status !== 'active') {
          try { await clearPushRecovery(actorId); next.recovery = null }
          catch { next.recoveryError = 'Server revocation is confirmed, but the local recovery record could not be cleared.' }
        }
      }
      if (actor.current === actorId && epoch.current === started) { setSnapshot(next); setFeedback({ actorId, error: null, message: null }); if (review) setReviewed({ actorId, capability: next.capability }) }
    }
    return next
  }, [actorId])

  function acknowledgeDevice(device: Device, consentVersion: number, base: Snapshot) {
    setSnapshot({ ...base, installationId: device.installationId, recovery: null, recoveryError: null,
      capability: { ...base.capability, consentVersion, devices: [device, ...base.capability.devices.filter(item => item.id !== device.id)] }, permission: { granted: true, canAskAgain: base.permission?.canAskAgain ?? false } })
  }
  async function enable(automatic = false) {
    if (pending.current || !actorId) return
    const captured = actorId, started = epoch.current, controller = new AbortController()
    const assertCurrent = () => { if (!usable(captured, started)) throw new Error('Push setup stopped because the signed-in account changed or signed out.') }
    pending.current = true; request.current = controller; setBusy(true); setFeedback(null)
    try {
      const latest = await refresh(); assertCurrent()
      const allowed = pushGate(pushRuntime.build, latest.capability)
      if (!allowed.allowed) throw new Error(allowed.reason)
      if (automatic && (latest.recovery || latest.recoveryError || !latest.permission?.granted || !latest.capability.devices.some(device => device.installationId === latest.installationId && device.status === 'active'))) return
      if (latest.recoveryError || (latest.recovery && !isReviewed)) throw new Error('Review your server registrations before retrying a previous push change.')
      if (latest.recovery?.operation === 'revoke') throw new Error('Resolve the saved revocation before enabling remote updates.')
      const proof = automatic ? await loadPushInstallation() : await ensurePushInstallation(); assertCurrent()
      if (!proof) return
      const granted = automatic ? (await pushRuntime.permission()).granted : await pushRuntime.requestPermission(); assertCurrent()
      if (!granted) throw new Error('Notification permission was not granted. You can change it in this device’s system settings; your in-app inbox still works.')
      const token = await pushRuntime.token(pushRuntime.build.projectId!); assertCurrent()
      const known = confirmedToken.current, registered = latest.capability.devices.find(device => device.installationId === proof.installationId && device.status === 'active')
      if (automatic && known?.actorId === captured && known.installationId === proof.installationId && known.token === token && known.deviceId === registered?.id && known.updatedAt === registered.updatedAt) return
      await savePushRecovery({ actorId: captured, installationId: proof.installationId, operation: 'register' }); assertCurrent()
      const { device, consentVersion } = await registerPushInstallation({ installationId: proof.installationId, installationSecret: proof.installationSecret, expoPushToken: token,
        projectId: pushRuntime.build.projectId!, platform: pushRuntime.build.platform === 'ios' ? 'ios' : 'android', permissionGranted: true, optIn: true, expectedConsentVersion: latest.capability.consentVersion }, captured, controller.signal)
      assertCurrent(); acknowledgeDevice(device, consentVersion, latest)
      confirmedToken.current = { actorId: captured, installationId: proof.installationId, token, deviceId: device.id, updatedAt: device.updatedAt }
      let cleanup = false
      try { await clearPushRecovery(captured) } catch { cleanup = true }
      if (usable(captured, started)) {
        const recovery = cleanup ? await loadPushRecovery(captured).catch(() => null) : null
        setSnapshot(previous => previous?.actorId === captured ? { ...previous, recovery, recoveryError: cleanup ? 'Registration was confirmed, but local recovery cleanup needs attention.' : null } : previous)
        setReviewed(null); setFeedback({ actorId: captured, error: null, message: cleanup ? 'Registration is confirmed. Review the remaining local recovery record before another change.' : automatic ? 'This device’s existing remote-update registration was refreshed.' : 'Remote updates are enabled for this account on this device.' })
      }
    } catch (reason) {
      if (usable(captured, started)) {
        setFeedback({ actorId: captured, error: errorMessage(reason), message: null })
        const recovery = await loadPushRecovery(captured).catch(() => null)
        if (usable(captured, started)) setSnapshot(previous => previous?.actorId === captured ? { ...previous, recovery } : previous)
      }
    } finally { pending.current = false; if (request.current === controller) request.current = null; setBusy(false) }
  }
  async function revoke(id: string) {
    if (pending.current || !actorId || !current) return
    const device = current.capability.devices.find(item => item.id === id)
    if (!device) return
    if (current.recoveryError || (current.recovery && (!isReviewed || (current.recovery.deviceId && current.recovery.deviceId !== id)))) { setFeedback({ actorId, error: 'Review and resolve the previous push change before starting a different one.', message: null }); return }
    const captured = actorId, started = epoch.current, controller = new AbortController()
    pending.current = true; request.current = controller; setBusy(true)
    try {
      await savePushRecovery({ actorId: captured, installationId: device.installationId, operation: 'revoke', deviceId: id })
      if (!usable(captured, started)) throw new Error('The signed-in account changed.')
      const capability = await revokePushInstallation(id, captured, controller.signal)
      if (!usable(captured, started)) return
      setSnapshot(previous => previous?.actorId === captured ? { ...previous, capability } : previous)
      await clearPushRecovery(captured)
      await refresh(); setReviewed(null); setFeedback({ actorId: captured, error: null, message: 'Server push registration revoked. An alert already sent to the device may still arrive.' })
    } catch (reason) {
      if (usable(captured, started)) { setFeedback({ actorId: captured, error: errorMessage(reason), message: null }); const recovery = await loadPushRecovery(captured).catch(() => null); if (usable(captured, started)) setSnapshot(previous => previous?.actorId === captured ? { ...previous, recovery } : previous) }
    } finally { pending.current = false; if (request.current === controller) request.current = null; setBusy(false) }
  }
  async function dismissRecovery() {
    if (pending.current || !isReviewed || !actorId) return
    pending.current = true; setBusy(true)
    try { await clearPushRecovery(actorId); await refresh(); setReviewed(null); setFeedback({ actorId, error: null, message: 'Local push recovery removed. Server registrations are separate and are shown above.' }) }
    catch (reason) { setFeedback({ actorId, error: errorMessage(reason), message: null }) }
    finally { pending.current = false; setBusy(false) }
  }
  async function resetProof() {
    if (pending.current || !isReviewed || !current?.proofError) return
    pending.current = true; setBusy(true)
    try { await resetPushInstallation(); await refresh(); setFeedback({ actorId, error: null, message: 'Local push proof reset. Re-enabling can recover a registration owned by this account; an active binding to another account must be revoked there first.' }) }
    catch (reason) { setFeedback({ actorId, error: errorMessage(reason), message: null }) }
    finally { pending.current = false; setBusy(false) }
  }
  useEffect(() => { maintenance.current = () => enable(true) })

  useEffect(() => beforeSignOut(async captured => {
    if (actor.current === captured.user.id) { paused.current = captured.user.id; epoch.current++; request.current?.abort() }
    await revokePushBeforeLogout(captured)
  }), [])
  useEffect(() => {
    if (pushRuntime.build.platform === 'web' || pushRuntime.build.expoGo) return
    let active = true, remove: (() => void) | null = null
    void pushRuntime.responses(() => { if (active) setTapped(value => value + 1) }).then(cleanup => { if (active) remove = cleanup; else cleanup() }, () => undefined)
    return () => { active = false; remove?.() }
  }, [])
  useEffect(() => {
    if (tapped > handledTap.current && !loading && session && navigation?.key) { handledTap.current = tapped; router.navigate('/notifications') }
  }, [tapped, loading, session, navigation?.key])
  useEffect(() => {
    if (!actorId || pushRuntime.build.platform === 'web' || pushRuntime.build.expoGo) return
    let active = true, removeToken: (() => void) | null = null, lastCheck = 0
    const check = async () => {
      if (!active || pending.current || AppState.currentState !== 'active' || Date.now() - lastCheck < 60000) return
      lastCheck = Date.now()
      try {
        const proof = await loadPushInstallation()
        if (!proof || !active) return
        const latest = await refresh()
        if (!active || latest.recovery || latest.recoveryError || !pushGate(pushRuntime.build, latest.capability).allowed) return
        // Only a previously active opt-in and still-granted system permission allow
        // foreground token maintenance. Unknown commands are never retried here.
        if (latest.capability.devices.some(device => device.installationId === proof.installationId && device.status === 'active')) {
          if (!removeToken) {
            const cleanup = await pushRuntime.changes(() => { if (active && !pending.current && AppState.currentState === 'active') void maintenance.current?.() })
            if (!active) { cleanup(); return }
            removeToken = cleanup
          }
          if (latest.permission?.granted) await maintenance.current?.()
        }
      } catch { /* The settings screen shows retryable registration/readback errors. */ }
    }
    void check()
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void check() })
    return () => { active = false; listener.remove(); removeToken?.() }
  }, [actorId, refresh])
  return <PushContext.Provider value={{ data: current, error: currentFeedback?.error ?? null, message: currentFeedback?.message ?? null, busy, reviewed: isReviewed, gate, refresh, enable, revoke, dismissRecovery, resetProof }}>{children}</PushContext.Provider>
}
export function usePush() { const value = useContext(PushContext); if (!value) throw new Error('PushProvider is required'); return value }
