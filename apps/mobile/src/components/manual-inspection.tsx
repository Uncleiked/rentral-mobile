import { useCallback, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import * as Crypto from 'expo-crypto'
import { manualInspectionSchema } from '../../../../lib/contracts/admin'
import { Button } from './Button'
import { Field } from './Field'
import { StatusView } from './StatusView'
import { useMemberResource } from '../hooks/use-member-resource'
import { useAuth } from '../providers/AuthProvider'
import { clearPendingManualInspection, loadPendingManualInspection, readManualInspection, submitManualInspection } from '../lib/manual-inspection-api'
import { ApiError, errorMessage } from '../lib/api'
import { colors, fonts, radius, space } from '../theme'

export function ManualInspection({ bookingId }: { bookingId: string }) {
  const { session } = useAuth(), actorId = session?.user.id ?? ''
  const status = useMemberResource(`/bookings/${bookingId}/manual-inspection`, manualInspectionSchema)
  const [evidence, setEvidence] = useState(''), [saved, setSaved] = useState<Awaited<ReturnType<typeof loadPendingManualInspection>>>(null)
  const [busy, setBusy] = useState(false), [checked, setChecked] = useState(false), [message, setMessage] = useState<string | null>(null)
  const [recoveryError, setRecoveryError] = useState<string | null>(null)
  const activeActor = useRef(''), pending = useRef(false)
  useFocusEffect(useCallback(() => {
    activeActor.current = actorId
    let active = true
    void loadPendingManualInspection(actorId, bookingId).then(value => { if (active) { setSaved(value); setChecked(false); setRecoveryError(null) } }, failure => { if (active) setRecoveryError(errorMessage(failure)) })
    return () => { active = false; activeActor.current = '' }
  }, [actorId, bookingId]))
  async function send() {
    if (pending.current || !status.data?.eligible || recoveryError || (saved && !checked)) return
    const command = saved?.command ?? { clientId: Crypto.randomUUID(), evidence: evidence.trim() }
    if (command.evidence.length < 30) { setMessage('Describe the actual inspection and supporting facts in at least 30 characters.'); return }
    pending.current = true; setBusy(true); setMessage(null)
    try {
      const result = await submitManualInspection(actorId, bookingId, command, Boolean(saved))
      if (activeActor.current === actorId) { status.replace(result); setSaved(null); setEvidence(''); setChecked(false); setMessage('Inspection evidence is confirmed. A nonparticipant administrator must review it; no payment is released by this submission.') }
    } catch (failure) {
      if (activeActor.current === actorId) { setMessage(errorMessage(failure)); try { setSaved(await loadPendingManualInspection(actorId, bookingId)) } catch (storageFailure) { setRecoveryError(errorMessage(storageFailure)) }; setChecked(false) }
    } finally { pending.current = false; if (activeActor.current === actorId) setBusy(false) }
  }
  async function check() {
    if (pending.current) return
    pending.current = true; setBusy(true); setMessage(null)
    try {
      const current = await readManualInspection(bookingId, actorId, saved?.command.clientId)
      if (activeActor.current !== actorId) return
      status.replace(current)
      if (saved) { await clearPendingManualInspection(actorId, bookingId, saved.command.clientId); setSaved(null); setChecked(false); setMessage('The original evidence is confirmed by its exact request receipt. No request was repeated.') }
      else { setChecked(true); setMessage(current.status === null ? 'No submitted evidence was found. An explicit retry uses the exact original instructions.' : 'Current inspection evidence is loaded. Review it before clearing device recovery.') }
    } catch (failure) {
      if (activeActor.current === actorId) {
        if (saved && failure instanceof ApiError && failure.status === 404) { setChecked(true); setMessage('No committed receipt was found for this original request. You can explicitly retry its exact identifier and evidence.'); await status.refresh(true).catch(() => undefined) }
        else setMessage(errorMessage(failure))
      }
    }
    finally { pending.current = false; if (activeActor.current === actorId) setBusy(false) }
  }
  return <View style={styles.card}><Text style={styles.heading}>Manual inspection review</Text><Text style={styles.help}>This gallery listing has no recorded location lock. Describe the inspection for administrative review. This creates no GPS proof and does not automatically release money.</Text>
    {status.loading ? <StatusView loading message="Loading inspection review…" /> : status.error ? <StatusView title="Inspection review unavailable" message={status.error} onRetry={() => { void status.refresh(true).catch(() => undefined) }} /> : status.data ? <>
      <Text style={styles.help}>Status: {status.data.status ?? 'Not submitted'}</Text>{status.data.evidence ? <Text selectable style={styles.help}>{status.data.evidence}</Text> : null}{status.data.reviewReason ? <Text selectable style={styles.warning}>{status.data.reviewReason}</Text> : null}
      {saved ? <><Text selectable style={styles.help}>{`Saved request ${saved.command.clientId}\n${saved.command.evidence}`}</Text><Button title="Check original inspection request" secondary busy={busy} onPress={() => { void check() }} /><Button title="Retry exact inspection request" disabled={busy || !checked || status.data.status !== null || !status.data.eligible} onPress={() => { void send() }} /></> : !recoveryError && status.data.eligible && status.data.status === null ? <><Field label="Inspection evidence" value={evidence} onChangeText={setEvidence} multiline maxLength={2000} editable={!busy} placeholder="Record what was inspected, who attended and the facts supporting the review." /><Button title="Submit inspection evidence for review" busy={busy} onPress={() => { void send() }} /></> : !status.data.eligible && !status.data.status ? <Text style={styles.help}>Evidence can be submitted for a confirmed gallery inspection from four hours before to seven days after its scheduled start.</Text> : null}
      <Button title="Refresh manual inspection status" secondary disabled={busy} onPress={() => { void check() }} />
      {recoveryError ? <><Text style={styles.warning}>{recoveryError}</Text>{checked ? <Button title="Clear reviewed inspection device recovery" secondary disabled={busy} onPress={() => { void clearPendingManualInspection(actorId, bookingId).then(() => { setRecoveryError(null); setSaved(null); setMessage('Device recovery was cleared after reviewing the current inspection. Server history is unchanged.') }, failure => setMessage(errorMessage(failure))) }} /> : null}</> : null}
    </> : null}
    {message ? <Text selectable accessibilityLiveRegion="polite" style={styles.warning}>{message}</Text> : null}
  </View>
}
const styles = StyleSheet.create({ card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.xl, padding: space.xl, gap: space.lg }, heading: { color: colors.text, fontFamily: fonts.semibold, fontSize: 19 }, help: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 22 }, warning: { color: colors.warning, fontFamily: fonts.medium, fontSize: 13, lineHeight: 22 } })
