import { useCallback, useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Host, Picker } from '@expo/ui'
import { Stack, useFocusEffect } from 'expo-router'
import { accountExportManifestSchema, type AccountExportResource } from '../../../lib/contracts/account-lifecycle'
import { Page } from '../src/components/Page'
import { Button } from '../src/components/Button'
import { StatusView } from '../src/components/StatusView'
import { useAuth } from '../src/providers/AuthProvider'
import { useMemberResource } from '../src/hooks/use-member-resource'
import { exportAccountResource } from '../src/lib/account-lifecycle-api'
import { createAccountExportFile } from '../src/lib/account-export-file'
import type { AccountExportFile } from '../src/lib/account-export-file.types'
import { errorMessage } from '../src/lib/api'
import { colors, fonts, radius, space } from '../src/theme'

export default function AccountExportScreen() {
  const { session } = useAuth()
  const actorId = session?.user.id ?? ''
  const actor = useRef(actorId)
  useEffect(() => { actor.current = actorId }, [actorId])
  const manifest = useMemberResource('/account/export', accountExportManifestSchema)
  const [resource, setResource] = useState<AccountExportResource>('profile')
  const [progress, setProgress] = useState({ items: 0, pages: 0 })
  const [result, setResult] = useState<{ actorId: string; resource: AccountExportResource; file: AccountExportFile; items: number; pages: number } | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [operation, setOperation] = useState<'prepare' | 'share' | 'remove' | null>(null)
  const busy = operation !== null
  const lock = useRef(false), controller = useRef<AbortController | null>(null)
  useFocusEffect(useCallback(() => () => controller.current?.abort(), []))
  const current = result?.actorId === actorId ? result : null
  async function download() {
    if (lock.current || !actorId || !manifest.data?.resources.includes(resource)) return
    lock.current = true; setOperation('prepare'); setMessage(null); setProgress({ items: 0, pages: 0 })
    const capturedActor = actorId, abort = new AbortController()
    controller.current = abort
    let file: AccountExportFile | null = null, complete = false
    try {
      file = await createAccountExportFile(capturedActor, resource)
      const totals = await exportAccountResource(capturedActor, resource, file, (items, pages) => { if (actor.current === capturedActor && !abort.signal.aborted) setProgress({ items, pages }) }, abort.signal)
      if (abort.signal.aborted || actor.current !== capturedActor) throw new Error('Export stopped because this screen or signed-in account changed.')
      complete = true; setResult({ actorId: capturedActor, file, ...totals })
      setMessage('Your export is ready. Choose Save or share to open your device’s save options.')
    } catch (reason) { if (actor.current === capturedActor) setMessage(errorMessage(reason)) }
    finally {
      if (file && !complete) await file.remove().catch(() => { if (actor.current === capturedActor) setMessage('Export stopped. The incomplete file could not be removed from this app’s private cache.') })
      if (controller.current === abort) controller.current = null
      lock.current = false; setOperation(null)
    }
  }
  async function share() {
    if (lock.current || !current) return
    lock.current = true; setOperation('share'); setMessage(null)
    try { await current.file.share(); setMessage('Save or share options opened. Choose your destination; Rentral cannot verify what another app saved.') }
    catch (reason) { setMessage(errorMessage(reason)) }
    finally { lock.current = false; setOperation(null) }
  }
  async function remove() {
    if (lock.current || !current) return
    lock.current = true; setOperation('remove')
    try { await current.file.remove(); setResult(null); setMessage('The app’s cached export was removed. Copies you saved or shared elsewhere are separate.') }
    catch (reason) { setMessage(errorMessage(reason)) }
    finally { lock.current = false; setOperation(null) }
  }
  return <><Stack.Screen options={{ title: 'Export account records' }} /><Page title="Take a copy of your records" subtitle="Export each resource before closing your account. Keep downloaded records somewhere private.">
    {manifest.loading ? <StatusView loading message="Checking available account records…" /> : !manifest.data ? <StatusView title="Export unavailable" message={manifest.error ?? 'Account export could not be loaded.'} onRetry={() => { void manifest.refresh().catch(() => undefined) }} /> : <View style={styles.card}>
      <Text style={styles.body}>{manifest.data.description}</Text><Text style={styles.help}>Choose one resource at a time. Every page of that resource is included. Data can change while the export runs; uploaded photos, videos and documents are separate.</Text>
      <Host matchContents colorScheme="dark" seedColor={colors.accentBright}><Picker selectedValue={resource} onValueChange={setResource} enabled={!busy && !current} testID="account-export-resource">{manifest.data.resources.map(item => <Picker.Item key={item} value={item} label={item.charAt(0).toUpperCase() + item.slice(1)} />)}</Picker></Host>
      {!current ? <Button title="Prepare account export" busy={busy} onPress={() => { void download() }} /> : <><Text selectable style={styles.body}>Ready: {current.resource} · {current.items} records across {current.pages} pages</Text><Button title="Save or share account export" busy={busy} onPress={() => { void share() }} /><Button title="Remove cached export and choose another resource" secondary disabled={busy} onPress={() => { void remove() }} /></>}
      {operation === 'prepare' ? <><Text accessibilityLiveRegion="polite" style={styles.help}>Prepared {progress.items} records across {progress.pages} pages.</Text><Button title="Cancel account export" secondary onPress={() => controller.current?.abort()} /></> : null}
      {manifest.error ? <Text style={styles.warning}>Could not refresh export resources: {manifest.error}</Text> : null}
    </View>}
    {message ? <Text selectable accessibilityLiveRegion="polite" style={styles.help}>{message}</Text> : null}
  </Page></>
}
const styles = StyleSheet.create({ card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.xl, padding: space.xl, gap: space.lg }, body: { color: colors.secondary, fontFamily: fonts.regular, fontSize: 14, lineHeight: 23 }, help: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 22 }, warning: { color: colors.warning, fontFamily: fonts.medium, fontSize: 13 } })
