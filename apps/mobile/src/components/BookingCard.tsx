import { useState } from 'react'
import { Linking, StyleSheet, Text, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { router } from 'expo-router'
import type { Booking } from '../lib/types'
import { memberAmount, memberDate, memberStatus } from '../lib/member-format'
import { config } from '../lib/config'
import { colors, fonts, radius, space } from '../theme'
import { Button } from './Button'

type Props = { booking: Booking }

export function BookingCard({ booking }: Props) {
  const [opening, setOpening] = useState(false)
  const [webError, setWebError] = useState<string | null>(null)
  const icon = booking.listing.category === 'house' ? 'home-outline' : booking.listing.category === 'car' ? 'car-outline' : 'boat-outline'
  const otherName = (booking.role === 'host' ? booking.renter.username : booking.host.username) ?? 'Rentral member'
  async function manageBooking(): Promise<void> {
    if (opening) return
    setOpening(true); setWebError(null)
    try { await Linking.openURL(`${config.apiUrl}/marketplace/bookings/${encodeURIComponent(booking.id)}`) }
    catch { setWebError('Could not open this booking in your browser. Please try again.') }
    finally { setOpening(false) }
  }
  return <View style={styles.card}>
    <View style={styles.top}><View style={styles.icon}><Ionicons name={icon} size={22} color={colors.accentBright} /></View>
      <View style={styles.heading}><Text style={styles.title}>{memberStatus(booking.kind)}</Text><Text style={styles.muted}>{booking.listing.location}</Text></View>
    </View>
    <View style={styles.status}><Text style={styles.statusText}>{memberStatus(booking.status)}</Text></View>
    <Text style={styles.body}>{memberDate(booking.startsAt)} — {memberDate(booking.endsAt)}</Text>
    <Text style={styles.muted}>{booking.role === 'host' ? 'Hosting' : 'Renting'} · {booking.role === 'host' ? 'Renter' : 'Host'}: {otherName}</Text>
    <View style={styles.divider} />
    <View style={styles.amountRow}><Text style={styles.muted}>Request total</Text><Text style={styles.amount}>{memberAmount(booking.amountKobo, booking.currency)}</Text></View>
    {/^[1-9]\d*$/.test(booking.holdCreditKobo) ? <>
      <View style={styles.amountRow}><Text style={styles.muted}>Applied holding credit</Text><Text style={styles.body}>{memberAmount(booking.holdCreditKobo, booking.currency)}</Text></View>
      <View style={styles.amountRow}><Text style={styles.muted}>Additional payment</Text><Text style={styles.body}>{memberAmount(booking.payableKobo, booking.currency)}</Text></View>
    </> : null}
    <Button secondary title="View listing" onPress={() => router.push({ pathname: '/listing/[id]', params: { id: booking.listing.id } })} />
    <Button secondary title="Manage booking on web" busy={opening} onPress={() => { void manageBooking() }} />
    <Text style={styles.muted}>Open your browser for booking updates, checkout and check-in. You may need to sign in again.</Text>
    {webError ? <Text accessibilityLiveRegion="polite" style={styles.error}>{webError}</Text> : null}
  </View>
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, padding: space.xl, gap: space.md },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.md }, icon: { padding: space.md, borderRadius: radius.pill, backgroundColor: colors.accentMuted }, heading: { flex: 1, gap: space.xs },
  title: { fontFamily: fonts.semibold, fontSize: 18, color: colors.text }, muted: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 20, color: colors.muted },
  body: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 20, color: colors.secondary }, status: { alignSelf: 'flex-start', backgroundColor: colors.glass, paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.pill },
  statusText: { fontFamily: fonts.medium, fontSize: 11, color: colors.text }, divider: { height: 1, backgroundColor: colors.border, marginVertical: space.xs },
  amountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: space.sm }, amount: { fontFamily: fonts.semibold, fontSize: 20, color: colors.accentBright },
  error: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 20, color: colors.warning },
})
