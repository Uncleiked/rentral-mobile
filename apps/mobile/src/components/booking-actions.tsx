import { useCallback, useRef, useState } from 'react'
import { AppState, Linking, StyleSheet, Text, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import * as Location from 'expo-location'
import { Button } from './Button'
import { Field } from './Field'
import { errorMessage } from '../lib/api'
import { bookingOutcomeUncertain, issueCheckInCode, prepareCheckout, reconcileBookingPayment, recordCheckIn, updateBooking } from '../lib/booking-api'
import { checkInReading, type BookingDetail, type BookingOperation } from '../lib/booking-contracts'
import { memberStatus } from '../lib/member-format'
import { useActorGuard } from '../hooks/use-actor-guard'
import { checkoutObservation, nativeAnalytics } from '../lib/native-analytics'
import { colors, fonts, radius, space } from '../theme'

type Props = { booking: BookingDetail; onUpdated: (booking: BookingDetail) => void; refresh: () => Promise<BookingDetail> }

async function freshLocation(): Promise<Location.LocationObject> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('Location is taking too long. Enable precise location, move outdoors, and retry.')), 20000) })])
  } finally { if (timer) clearTimeout(timer) }
}

export function BookingActions({ booking, onUpdated, refresh }: Props) {
  const { actorId, isCurrent } = useActorGuard()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [uncertain, setUncertain] = useState<'update' | 'checkout' | null>(null)
  const [code, setCode] = useState('')
  const [shownCode, setShownCode] = useState('')
  const [permissionDenied, setPermissionDenied] = useState(false)
  const [preparedUrl, setPreparedUrl] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const pending = useRef(false)
  const active = useRef(true)
  useFocusEffect(useCallback(() => {
    active.current = true
    const timer = setInterval(() => { if (AppState.currentState === 'active') setNow(Date.now()) }, 1000)
    return () => { active.current = false; clearInterval(timer) }
  }, []))
  const locked = Boolean(busy)
  const deadlinePassed = Boolean(booking.expiresAt && Date.parse(booking.expiresAt) <= now)

  async function perform(name: string, work: () => Promise<void>, uncertainKind: 'update' | 'checkout' | null = 'update'): Promise<void> {
    if (pending.current || !isCurrent(actorId)) return
    pending.current = true; setBusy(name); setError(null); setNotice(null)
    try { await work() }
    catch (reason) {
      if (active.current && isCurrent(actorId)) { setError(errorMessage(reason)); if (uncertainKind && bookingOutcomeUncertain(reason)) setUncertain(uncertainKind) }
    } finally { pending.current = false; if (active.current && isCurrent(actorId)) setBusy(null) }
  }
  function change(operation: BookingOperation): void {
    if (uncertain) return
    void perform(operation, async () => {
      const updated = await updateBooking(booking.id, operation, actorId)
      if (active.current && isCurrent(actorId)) { onUpdated(updated); setNotice('Your booking has been updated.') }
    })
  }
  function issueCode(): void {
    if (uncertain || booking.inspectionMode === 'manual') return
    setShownCode('')
    void perform('code', async () => {
      const result = await issueCheckInCode(booking.id, actorId)
      if (active.current && isCurrent(actorId)) setShownCode(result.code)
    })
  }
  async function checkIn(): Promise<void> {
    if (pending.current || uncertain || booking.inspectionMode === 'manual' || !isCurrent(actorId)) return
    pending.current = true; setBusy('check-in'); setError(null); setNotice(null)
    let submitted = false
    try {
      const authorization = await Location.requestForegroundPermissionsAsync()
      if (!authorization.granted) { setPermissionDenied(true); throw new Error('Allow precise location to check in. Open your device settings, then try again.') }
      setPermissionDenied(false)
      const reading = checkInReading(await freshLocation())
      if (!active.current || !isCurrent(actorId) || AppState.currentState !== 'active') throw new Error('Keep this booking open while checking in, then try again.')
      submitted = true
      const updated = await recordCheckIn(booking.id, { ...reading, ...(booking.role === 'host' ? { code } : {}) }, actorId)
      if (active.current && isCurrent(actorId)) {
        onUpdated(updated)
        setNotice(updated.status === 'completed' ? 'Both check-ins are complete. Settlement is handled separately.' : 'Your presence was recorded. Both participants must check in within 15 minutes.')
      }
    } catch (reason) {
      if (active.current && isCurrent(actorId)) { setError(errorMessage(reason)); if (submitted && bookingOutcomeUncertain(reason)) setUncertain('update') }
    } finally { pending.current = false; if (active.current && isCurrent(actorId)) setBusy(null) }
  }
  function checkout(): void {
    if (uncertain) return
    void perform('checkout', async () => {
      const result = await prepareCheckout(booking.id, actorId)
      if (!active.current || !isCurrent(actorId)) return
      setPreparedUrl(result.url)
      const observation = checkoutObservation(booking)
      if (observation) void nativeAnalytics.record(actorId, observation)
      try {
        await Linking.openURL(result.url)
        if (active.current && isCurrent(actorId)) setNotice('Checkout opened in your browser. Return here and check payment status after paying.')
      } catch { if (active.current && isCurrent(actorId)) setError('Your checkout is ready, but the browser could not open. Use Open prepared checkout to retry the same link.') }
    }, 'checkout')
  }
  function resumeCheckout(): void {
    if (!preparedUrl) return
    void perform('open-checkout', async () => {
      try { await Linking.openURL(preparedUrl) }
      catch { throw new Error('The browser could not open this checkout. Your booking remains unchanged; check payment status before paying again.') }
    }, null)
  }
  function reconcile(): void {
    const payment = booking.payments[0]
    if (!payment) return
    void perform('reconcile', async () => {
      const result = await reconcileBookingPayment(booking.id, payment.reference, actorId)
      if (!isCurrent(actorId)) return
      await refresh()
      if (active.current && isCurrent(actorId)) { setUncertain(null); setNotice(`Payment status: ${memberStatus(result.status)}. Refunds and payouts are separate.`) }
    }, 'checkout')
  }
  function checkCurrentState(): void {
    void perform('refresh', async () => {
      await refresh()
      if (active.current && isCurrent(actorId) && uncertain !== 'checkout') { setUncertain(null); setNotice('The latest booking status is shown. Review it before taking another action.') }
    }, null)
  }

  return <View style={styles.card}>
    <Text style={styles.heading}>Your next step</Text>
    {booking.status === 'requested' ? <Text style={styles.help}>{booking.role === 'host' ? 'Review the dates and price. Accepting reserves rental availability for a 30-minute payment window.' : 'Your request is with the host. Payment is available after they accept.'}</Text> : null}
    {booking.actions.accept ? <Button title="Accept request" disabled={locked || Boolean(uncertain)} busy={busy === 'accept'} onPress={() => change('accept')} /> : null}
    {booking.actions.cancel ? <Button title="Cancel request" secondary disabled={locked || Boolean(uncertain)} busy={busy === 'cancel'} onPress={() => change('cancel')} /> : null}
    {booking.actions.complete ? <Button title="Mark rental complete" disabled={locked || Boolean(uncertain)} busy={busy === 'complete'} onPress={() => change('complete')} /> : null}
    {booking.status === 'awaiting_payment' && booking.role === 'renter' ? <>
      <Text style={styles.help}>{deadlinePassed ? 'The payment window has ended. Refresh this booking to see its current status.' : 'Pay only the additional amount shown above. Returning from checkout does not confirm payment.'}</Text>
      {!booking.paymentAvailable ? <Text style={styles.help}>Online payments are not available. This booking remains unpaid.</Text> : null}
      {booking.actions.checkout && !deadlinePassed ? preparedUrl ? <Button title="Open prepared checkout" disabled={locked} busy={busy === 'open-checkout'} onPress={resumeCheckout} /> : <Button title="Continue to Paystack" disabled={locked || Boolean(uncertain)} busy={busy === 'checkout'} onPress={checkout} /> : null}
    </> : null}
    {booking.payments[0] ? <Text selectable style={styles.help}>Latest payment: {memberStatus(booking.payments[0].status)}</Text> : null}
    {booking.actions.reconcile && booking.payments[0] ? <Button title="Check payment status" secondary disabled={locked} busy={busy === 'reconcile'} onPress={reconcile} /> : null}
    {booking.status === 'confirmed' && booking.kind === 'inspection' && booking.inspectionMode !== 'manual' ? <>
      <Text style={styles.help}>Check in together within 20 metres of the asset. Location is sent privately for the proximity check; it is not displayed to the other participant.</Text>
      <Text style={styles.help}>Your check-in: {(booking.role === 'renter' ? booking.checkIn.renterAt : booking.checkIn.hostAt) ? 'Recorded' : 'Waiting'} · Other participant: {(booking.role === 'renter' ? booking.checkIn.hostAt : booking.checkIn.renterAt) ? 'Recorded' : 'Waiting'}</Text>
      {booking.actions.issueCode ? <><Button title="Show my check-in code" secondary disabled={locked || Boolean(uncertain)} busy={busy === 'code'} onPress={issueCode} />
        {shownCode ? <><Text selectable accessibilityLabel={`Check-in code ${shownCode.split('').join(' ')}`} style={styles.code}>{shownCode}</Text><Text style={styles.help}>Show this code to the host. Generating another code replaces it.</Text></> : null}</> : null}
      {booking.role === 'host' && booking.actions.checkIn ? <Field label="Renter’s six-digit code" value={code} onChangeText={value => setCode(value.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" autoComplete="one-time-code" maxLength={6} editable={!locked && !uncertain} /> : null}
      {booking.actions.checkIn ? <Button title="Check in at the asset" disabled={locked || Boolean(uncertain) || (booking.role === 'host' && code.length !== 6)} busy={busy === 'check-in'} onPress={() => { void checkIn() }} /> : null}
      {permissionDenied ? <Button title="Open location settings" secondary onPress={() => { void Linking.openSettings().catch(() => setError('Device settings could not open. Open them manually and allow precise location.')) }} /> : null}
    </> : null}
    {booking.status === 'completed' ? <Text style={styles.help}>This booking is complete. Provider settlement, refunds and payouts require their own confirmation.</Text> : null}
    {booking.status === 'converted' ? <Text style={styles.help}>This hold has been allocated once to its rental. It cannot fund another booking.</Text> : null}
    {uncertain ? <><Text accessibilityRole="alert" selectable style={styles.error}>{uncertain === 'checkout' ? 'The checkout result could not be confirmed. Refresh this booking and check payment status before paying again.' : 'The update may have reached Rentral. Refresh the booking before trying again.'}</Text><Button title="Refresh booking status" secondary disabled={locked} busy={busy === 'refresh'} onPress={checkCurrentState} /></> : null}
    {error ? <Text accessibilityRole="alert" selectable style={styles.error}>{error}</Text> : null}
    {notice ? <Text accessibilityLiveRegion="polite" selectable style={styles.notice}>{notice}</Text> : null}
  </View>
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, padding: space.xl, gap: space.lg },
  heading: { color: colors.text, fontFamily: fonts.semibold, fontSize: 20 }, help: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 22 },
  error: { color: colors.warning, fontFamily: fonts.medium, fontSize: 13, lineHeight: 22 }, notice: { color: colors.accentBright, fontFamily: fonts.medium, fontSize: 13, lineHeight: 22 },
  code: { color: colors.text, fontFamily: fonts.bold, fontSize: 30, letterSpacing: 5, fontVariant: ['tabular-nums'] },
})
