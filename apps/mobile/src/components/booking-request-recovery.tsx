import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import { Button } from './Button'
import type { useBookingRequestRecovery } from '../hooks/use-booking-request-recovery'
import { colors, fonts, space } from '../theme'

export function BookingRequestRecovery({ recovery }: { recovery: ReturnType<typeof useBookingRequestRecovery> }) {
  const [confirmDismissal, setConfirmDismissal] = useState(false)
  const record = recovery.record
  const items = record ? recovery.history.filter(item => item.role === 'renter' && item.listing.id === record.command.listingId).slice(0, 5) : []
  return <View style={styles.section}>
    <Text style={styles.heading}>{record?.confirmedId ? 'Confirm your saved booking' : 'A saved request needs confirmation'}</Text>
    {recovery.recoveryError ? <Text selectable accessibilityRole="alert" style={styles.warning}>{recovery.recoveryError}</Text> : record ? <>
      <Text selectable style={styles.body}>{record.command.kind} · {new Date(record.command.startsAt).toLocaleString()} to {new Date(record.command.endsAt).toLocaleString()}</Text>
      <Text selectable style={styles.help}>Request identifier: {record.command.clientId}</Text>
      {record.confirmedId ? <Text style={styles.help}>Rentral acknowledged this booking. Confirmation reads its current status without sending another booking request.</Text> : <Text style={styles.help}>This request may already be recorded. Check your bookings first. A retry sends the same dates and request identifier, even after closing and reopening the app.</Text>}
    </> : null}
    <Button title="Check booking history" secondary busy={recovery.busy} onPress={() => { setConfirmDismissal(false); void recovery.check() }} />
    {items.map(item => <View key={item.id} style={styles.section}><Text style={styles.body}>{item.kind} · {item.status.replaceAll('_', ' ')}</Text><Text style={styles.help}>{new Date(item.startsAt).toLocaleString()} to {new Date(item.endsAt).toLocaleString()}</Text><Button title={`View ${item.kind} booking`} secondary onPress={() => router.push({ pathname: '/booking/[id]', params: { id: item.id } })} /></View>)}
    {record ? <Button title={record.confirmedId ? 'Confirm saved booking' : 'Retry exact saved booking request'} disabled={recovery.busy || (!record.confirmedId && !recovery.checked)} onPress={() => { setConfirmDismissal(false); void recovery.send() }} /> : null}
    <Button title="View all bookings" secondary disabled={recovery.busy} onPress={() => router.push('/(tabs)/bookings')} />
    {recovery.checked ? confirmDismissal ? <><Text style={styles.warning}>Dismissal only removes this device’s recovery record. Any booking already recorded still exists. Creating a different request afterward may create another booking.</Text><Button title="Confirm dismissal of local booking recovery" secondary disabled={recovery.busy} onPress={() => { void recovery.dismiss() }} /><Button title="Keep saved booking recovery" secondary onPress={() => setConfirmDismissal(false)} /></> : <Button title="Dismiss local booking recovery" secondary disabled={recovery.busy} onPress={() => setConfirmDismissal(true)} /> : null}
  </View>
}
const styles = StyleSheet.create({ section: { gap: space.md }, heading: { color: colors.text, fontFamily: fonts.semibold, fontSize: 18 }, body: { color: colors.secondary, fontFamily: fonts.regular, fontSize: 14, lineHeight: 22 }, help: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 21 }, warning: { color: colors.warning, fontFamily: fonts.medium, fontSize: 13, lineHeight: 22 } })
