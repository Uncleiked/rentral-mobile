import { useCallback, useState } from 'react'
import { Linking, StyleSheet, Text, View } from 'react-native'
import { Stack, router, useFocusEffect } from 'expo-router'
import { Page } from '../src/components/Page'
import { Button } from '../src/components/Button'
import { StatusView } from '../src/components/StatusView'
import { usePush } from '../src/providers/PushProvider'
import { colors, fonts, radius, space } from '../src/theme'

export default function PushSettingsScreen() {
  const push = usePush()
  const refresh = push.refresh
  const [confirmation, setConfirmation] = useState<string | null>(null), [localError, setLocalError] = useState<string | null>(null)
  useFocusEffect(useCallback(() => { void refresh().catch(() => undefined) }, [refresh]))
  const current = push.data?.capability.devices.find(device => device.installationId === push.data?.installationId && device.status === 'active')
  const recovering = Boolean(push.data?.recovery || push.data?.recoveryError)
  const retryDevice = push.data?.recovery?.operation === 'revoke' ? push.data.capability.devices.find(device => push.data?.recovery?.deviceId ? device.id === push.data.recovery.deviceId : device.installationId === push.data?.recovery?.installationId) : null
  return <><Stack.Screen options={{ title: 'Remote update settings' }} /><Page title="Remote updates, your choice" subtitle="Generic alerts can tell you that Rentral has an update. Open your signed-in inbox to read the details.">
    <View style={styles.card}><Text style={styles.heading}>This device</Text><Text style={styles.body}>{push.gate.reason}</Text>
      {push.data ? <>
        {push.data.permission ? <Text style={styles.help}>System permission: {push.data.permission.granted ? 'Allowed' : 'Not granted'}</Text> : null}
        <Text style={styles.help}>{current ? 'The server has an active registration for this installation.' : 'No active server registration is confirmed for this installation.'} You can always read notifications in the app.</Text>
        {!recovering ? <Button title={current ? 'Refresh this device’s push registration' : 'Enable remote updates on this device'} disabled={!push.gate.allowed || Boolean(push.data.proofError)} busy={push.busy} onPress={() => { void push.enable() }} /> : null}
        {push.gate.allowed && push.data.permission && !push.data.permission.granted ? <Button title="Open this device’s notification settings" secondary disabled={push.busy} onPress={() => { void Linking.openSettings().catch(() => setLocalError('This device’s settings could not be opened.')) }} /> : null}
        {push.data.proofError ? <><Text style={styles.warning}>{push.data.proofError}</Text>{push.reviewed ? confirmation === 'proof' ? <><Text style={styles.warning}>Resetting removes the unreadable private proof in this app. Server device registrations are separate; review and revoke any you no longer want.</Text><Button title="Confirm resetting unreadable push proof" secondary disabled={push.busy} onPress={() => { setConfirmation(null); void push.resetProof() }} /></> : <Button title="Reset unreadable local push proof" secondary disabled={push.busy} onPress={() => setConfirmation('proof')} /> : null}</> : null}
      </> : push.error ? <StatusView title="Registration status unavailable" message={push.error} onRetry={() => { void refresh(true).catch(() => undefined) }} /> : <StatusView loading message="Reviewing your push registrations…" />}
      <Button title="Review server push registrations" secondary disabled={push.busy} onPress={() => { setConfirmation(null); void refresh(true).catch(() => undefined) }} />
      <Button title="Open my notification inbox" secondary onPress={() => router.push('/notifications')} />
    </View>
    {recovering ? <View style={styles.card}><Text style={styles.heading}>A previous change needs attention</Text><Text style={styles.help}>{push.data?.recoveryError ?? 'This change may already be recorded. Review the server registrations before retrying. Rentral does not repeat an uncertain registration automatically.'}</Text>
      {push.data?.recovery?.operation === 'register' ? <Button title="Retry this device’s push registration" busy={push.busy} disabled={!push.reviewed || !push.gate.allowed || Boolean(push.data.proofError)} onPress={() => { void push.enable() }} /> : retryDevice ? <Button title="Retry saved device revocation" busy={push.busy} disabled={!push.reviewed} onPress={() => { void push.revoke(retryDevice.id) }} /> : null}
      {push.reviewed ? confirmation === 'recovery' ? <><Text style={styles.warning}>Removing this local record does not revoke a server registration. The server state above remains authoritative.</Text><Button title="Confirm removing local push recovery" secondary disabled={push.busy} onPress={() => { setConfirmation(null); void push.dismissRecovery() }} /></> : <Button title="Remove local push recovery after review" secondary disabled={push.busy} onPress={() => setConfirmation('recovery')} /> : null}
    </View> : null}
    {push.data?.capability.devices.length ? <View style={styles.section}><Text style={styles.heading}>Your server device registrations</Text>{push.data.capability.devices.map((device, index) => <View key={device.id} style={styles.card}>
      <Text style={styles.heading}>{device.installationId === push.data?.installationId ? 'This installation' : `Device registration ${index + 1}`} · {device.platform === 'ios' ? 'iOS' : 'Android'}</Text>
      <Text style={styles.body}>{device.status === 'active' ? 'Registered for remote updates' : device.status === 'revoked' ? 'Revocation recorded' : 'The provider no longer recognizes this token'}</Text>
      <Text style={styles.help}>Registered {new Date(device.optedInAt).toLocaleString()}{device.revokedAt ? `\nRevoked ${new Date(device.revokedAt).toLocaleString()}` : ''}</Text>
      {device.status === 'active' ? confirmation === device.id ? <><Text style={styles.help}>This registration will stop receiving new remote alerts. Its account inbox remains available.</Text><Button title={`Confirm revoking device registration ${index + 1}`} secondary disabled={push.busy || (recovering && !push.reviewed)} onPress={() => { setConfirmation(null); void push.revoke(device.id) }} /><Button title="Keep this device registration" secondary disabled={push.busy} onPress={() => setConfirmation(null)} /></> : <Button title={`Revoke device registration ${index + 1}`} secondary disabled={push.busy || (recovering && !push.reviewed)} onPress={() => setConfirmation(device.id)} /> : null}
    </View>)}</View> : null}
    {push.error && push.data ? <Text selectable accessibilityRole="alert" style={styles.warning}>{push.error}</Text> : null}{push.message ? <Text selectable accessibilityLiveRegion="polite" style={styles.help}>{push.message}</Text> : null}{localError ? <Text style={styles.warning}>{localError}</Text> : null}
  </Page></>
}
const styles = StyleSheet.create({ card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.xl, padding: space.xl, gap: space.lg }, section: { gap: space.lg }, heading: { color: colors.text, fontFamily: fonts.semibold, fontSize: 18 }, body: { color: colors.secondary, fontFamily: fonts.regular, fontSize: 14, lineHeight: 23 }, help: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 21 }, warning: { color: colors.warning, fontFamily: fonts.medium, fontSize: 13, lineHeight: 22 } })
