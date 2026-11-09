import { StyleSheet, Text, View } from 'react-native'
import type { BookingDetail, BookingQuote } from '../lib/booking-contracts'
import { memberAmount, memberDate, memberStatus, memberTime } from '../lib/member-format'
import { colors, fonts, radius, space } from '../theme'

export function BookingQuoteSummary({ quote, preview = false }: { quote: BookingQuote; preview?: boolean }) {
  return <View style={styles.card}>
    <Text style={styles.heading}>{preview ? 'Your quote' : 'Price breakdown'}</Text>
    <View style={styles.row}><Text style={styles.label}>Base amount</Text><Text selectable style={styles.value}>{memberAmount(quote.baseKobo, quote.currency)}</Text></View>
    {quote.fees.map((fee, index) => <View key={`${fee.label}:${index}`} style={styles.row}><Text style={styles.label}>{fee.label}</Text><Text selectable style={styles.value}>{memberAmount(fee.amountKobo, quote.currency)}</Text></View>)}
    <View style={styles.row}><Text style={styles.label}>Total</Text><Text selectable style={styles.total}>{memberAmount(quote.totalKobo, quote.currency)}</Text></View>
    {BigInt(quote.holdCreditKobo) > 0 ? <>
      <View style={styles.row}><Text style={styles.label}>{preview ? 'Available holding credit' : 'Applied holding credit'}</Text><Text selectable style={styles.value}>{memberAmount(quote.holdCreditKobo, quote.currency)}</Text></View>
      <View style={styles.row}><Text style={styles.label}>{preview ? 'Balance after acceptance' : 'Additional payment'}</Text><Text selectable style={styles.total}>{memberAmount(quote.payableKobo, quote.currency)}</Text></View>
    </> : null}
    {preview ? <Text style={styles.help}>The server checks the price and availability again when you send your request. Holding credit is allocated only after the host accepts.</Text> : null}
  </View>
}

export function BookingSummary({ booking }: { booking: BookingDetail }) {
  const other = (booking.role === 'host' ? booking.renter.username : booking.host.username) ?? 'Rentral member'
  return <View style={styles.card}>
    <Text style={styles.heading}>{memberStatus(booking.kind)} · {memberStatus(booking.status)}</Text>
    <Text selectable style={styles.value}>{booking.listing.location}</Text>
    <Text selectable style={styles.value}>{memberDate(booking.startsAt)} at {memberTime(booking.startsAt)}{ '\n' }to {memberDate(booking.endsAt)} at {memberTime(booking.endsAt)}</Text>
    <Text style={styles.help}>Times use this device’s time zone. {booking.role === 'host' ? 'Renter' : 'Host'}: {other}</Text>
    <View style={styles.row}><Text style={styles.label}>Request total</Text><Text selectable style={styles.total}>{memberAmount(booking.amountKobo, booking.currency)}</Text></View>
    {BigInt(booking.holdCreditKobo) > 0 ? <>
      <View style={styles.row}><Text style={styles.label}>Applied holding credit</Text><Text selectable style={styles.value}>{memberAmount(booking.holdCreditKobo, booking.currency)}</Text></View>
      <View style={styles.row}><Text style={styles.label}>Additional payment</Text><Text selectable style={styles.total}>{memberAmount(booking.payableKobo, booking.currency)}</Text></View>
    </> : booking.quote?.holdBookingId ? <Text style={styles.help}>This request asks to use a paid hold. The host must accept before the holding credit is allocated.</Text> : null}
    {booking.expiresAt ? <Text selectable style={styles.help}>{booking.kind === 'hold' && booking.status === 'confirmed' ? 'Hold ends' : 'Payment window ends'}: {new Date(booking.expiresAt).toLocaleString()}</Text> : null}
    <Text style={styles.help}>Settlement: {memberStatus(booking.settlementStatus)}. A completed booking or collected payment does not confirm a refund or payout.</Text>
  </View>
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, padding: space.xl, gap: space.lg },
  heading: { color: colors.text, fontFamily: fonts.semibold, fontSize: 20 }, row: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: space.md },
  label: { flexShrink: 1, color: colors.muted, fontFamily: fonts.regular, fontSize: 13 }, value: { color: colors.secondary, fontFamily: fonts.medium, fontSize: 14, lineHeight: 23 },
  total: { color: colors.accentBright, fontFamily: fonts.bold, fontSize: 19, fontVariant: ['tabular-nums'] }, help: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 21 },
})
