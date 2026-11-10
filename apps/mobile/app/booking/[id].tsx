import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native'
import { Stack, router, useLocalSearchParams } from 'expo-router'
import { Page } from '../../src/components/Page'
import { StatusView } from '../../src/components/StatusView'
import { Button } from '../../src/components/Button'
import { BookingActions } from '../../src/components/booking-actions'
import { BookingSummary, BookingQuoteSummary } from '../../src/components/booking-summary'
import { BookingRequest } from '../../src/components/BookingRequest'
import { BookingFeedback } from '../../src/components/booking-feedback'
import { ManualInspection } from '../../src/components/manual-inspection'
import { useBookingDetail } from '../../src/hooks/use-booking-detail'
import { canRequestOrdinaryPayout } from '../../src/lib/financial-input'
import { colors, fonts, space } from '../../src/theme'

export default function BookingScreen() {
  const params = useLocalSearchParams<{ id: string }>()
  const id = typeof params.id === 'string' ? params.id : ''
  const validId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  const resource = useBookingDetail(id, validId)
  const booking = resource.data
  const refresh = () => resource.refresh(true)
  return <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <Stack.Screen options={{ title: 'Booking', headerShown: true }} />
    <Page title="Your booking" subtitle="The current details and your next step." refreshing={resource.refreshing} onRefresh={validId ? () => { void refresh().catch(() => undefined) } : undefined}>
      {!validId ? <StatusView title="Booking unavailable" message="This booking link is invalid." /> : resource.loading ? <StatusView loading message="Opening your booking…" /> : !booking ? <StatusView title="Booking unavailable" message={resource.error ?? 'This booking is unavailable to your account.'} onRetry={() => { void refresh().catch(() => undefined) }} /> : <>
        {resource.error ? <View style={styles.feedback}><Text accessibilityRole="alert" selectable style={styles.error}>Could not refresh: {resource.error}</Text><Button title="Refresh booking" secondary onPress={() => { void refresh().catch(() => undefined) }} /></View> : null}
        <BookingSummary booking={booking} />
        {booking.quote ? <BookingQuoteSummary quote={booking.quote} /> : null}
        {booking.inspectionMode !== 'manual' || Object.values(booking.actions).some(Boolean) || booking.payments.length ? <BookingActions key={booking.id} booking={booking} onUpdated={resource.replace} refresh={refresh} /> : null}
        {booking.inspectionMode === 'manual' && booking.kind === 'inspection' ? <ManualInspection bookingId={booking.id} /> : null}
        {booking.actions.convertHold ? <BookingRequest listingId={booking.listing.id} intent="rent" hold={booking} /> : null}
        {['confirmed', 'completed', 'disputed'].includes(booking.status) ? <BookingFeedback bookingId={booking.id} status={booking.status} onChanged={refresh} /> : null}
        {booking.rentalBookingId ? <Button title="View linked rental" secondary onPress={() => router.push({ pathname: '/booking/[id]', params: { id: booking.rentalBookingId! } })} /> : null}
        {booking.holdBookingId ? <Button title="View original hold" secondary onPress={() => router.push({ pathname: '/booking/[id]', params: { id: booking.holdBookingId! } })} /> : null}
        {canRequestOrdinaryPayout(booking) ? <Button title="Request a payout review" secondary onPress={() => router.push({ pathname: '/financial-request', params: { kind: 'payout', bookingId: booking.id } })} /> : null}
        {booking.kind === 'rental' && booking.listing.category === 'house' && ['confirmed', 'completed'].includes(booking.status) ? <Button title="Lease, renewal and termination" secondary onPress={() => router.push({ pathname: '/lease/[id]', params: { id: booking.id } })} /> : null}
        <Button title="Payments and refund requests" secondary onPress={() => router.push('/financial')} />
        <Button title="View listing" secondary onPress={() => router.push({ pathname: '/listing/[id]', params: { id: booking.listing.id } })} />
      </>}
    </Page>
  </KeyboardAvoidingView>
}

const styles = StyleSheet.create({ keyboard: { flex: 1, backgroundColor: colors.background }, feedback: { gap: space.md }, error: { color: colors.warning, fontFamily: fonts.regular, fontSize: 13, lineHeight: 22 } })
