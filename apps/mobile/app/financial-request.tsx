import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native'
import { Host, Picker } from '@expo/ui'
import * as Crypto from 'expo-crypto'
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { financialPaymentResultSchema, type FinancialOperationDTO } from '../../../lib/contracts/financial'
import { Page } from '../src/components/Page'
import { Button } from '../src/components/Button'
import { Field } from '../src/components/Field'
import { StatusView } from '../src/components/StatusView'
import { FinancialOperationCard } from '../src/components/financial-operation-card'
import { useAuth } from '../src/providers/AuthProvider'
import { useFinancialWorkspace } from '../src/hooks/use-financial-workspace'
import { useMemberResource } from '../src/hooks/use-member-resource'
import { useBookingDetail } from '../src/hooks/use-booking-detail'
import { canRequestOrdinaryPayout, financialCommandSchema, koboToNaira, nairaToKobo, type FinancialCommand } from '../src/lib/financial-input'
import { dismissPendingFinancialCommand, loadPendingFinancialCommand, submitPendingFinancialCommand } from '../src/lib/financial-pending-store'
import { memberAmount } from '../src/lib/member-format'
import { ApiError, errorMessage } from '../src/lib/api'
import { colors, fonts, radius, space } from '../src/theme'

export default function FinancialRequestScreen() {
  const params = useLocalSearchParams<{ kind?: string; bookingId?: string; paymentId?: string }>()
  const { session } = useAuth()
  const actorId = session?.user.id ?? ''
  const actor = useRef(actorId)
  useEffect(() => { actor.current = actorId }, [actorId])
  const kind = params.kind === 'payout' ? 'payout' : 'refund'
  const bookingId = typeof params.bookingId === 'string' ? params.bookingId : ''
  const paymentId = typeof params.paymentId === 'string' ? params.paymentId : ''
  const validBooking = /^[0-9a-f-]{36}$/i.test(bookingId)
  const booking = useBookingDetail(bookingId, kind === 'payout' && validBooking)
  const workspace = useFinancialWorkspace()
  const paymentSchema = useMemo(() => financialPaymentResultSchema.refine(value => value.payment.id === paymentId && BigInt(value.payment.availableKobo) <= BigInt(value.payment.amountKobo)), [paymentId])
  const paymentSource = useMemberResource(`/financial/payments/${encodeURIComponent(paymentId)}`, paymentSchema, kind === 'refund' && /^[0-9a-f-]{36}$/i.test(paymentId))
  const payment = paymentSource.data?.payment
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [recipientId, setRecipientId] = useState('')
  const recipients = workspace.data?.recipients.filter(item => item.status === 'active') ?? []
  const selectedRecipient = recipients.find(item => item.id === recipientId) ?? recipients[0]
  const [record, setRecord] = useState<{ actorId: string; command: FinancialCommand | null; error: string | null } | null>(null)
  const [result, setResult] = useState<FinancialOperationDTO | null>(null)
  const [busy, setBusy] = useState(false)
  const [checked, setChecked] = useState(false)
  const [reviewed, setReviewed] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const pending = useRef(false)
  const current = record?.actorId === actorId ? record : null
  const command = current?.command
  useFocusEffect(useCallback(() => {
    if (!actorId) return
    let active = true
    void loadPendingFinancialCommand(actorId).then(saved => { if (active) { setRecord({ actorId, command: saved, error: null }); setChecked(false) } }, failure => {
      if (active) setRecord({ actorId, command: null, error: errorMessage(failure) })
    })
    return () => { active = false }
  }, [actorId]))
  async function checkHistory(): Promise<void> {
    if (pending.current) return
    pending.current = true; setBusy(true); setMessage(null)
    try { await workspace.refresh(true); setChecked(true); setReviewed(true); setMessage('Your latest financial history has been loaded. A retry below uses the exact saved instructions and request identifier.') }
    catch (failure) { setMessage(errorMessage(failure)) }
    finally { pending.current = false; setBusy(false) }
  }
  async function submit(): Promise<void> {
    if (pending.current || !actorId || !current || current.error || (command && !checked)) return
    let next = command
    if (!next) {
      try {
        const amountKobo = nairaToKobo(amount)
        if (kind === 'refund' && (!payment || BigInt(amountKobo) > BigInt(payment.availableKobo))) throw new Error('Choose an amount within this payment’s unreserved amount.')
        if (kind === 'payout' && (!booking.data || !canRequestOrdinaryPayout(booking.data) || !selectedRecipient || BigInt(amountKobo) > BigInt(booking.data.amountKobo))) throw new Error('Choose a completed host booking, active recipient and an amount within the booking total.')
        const parsed = financialCommandSchema.safeParse({ clientId: Crypto.randomUUID(), kind, amountKobo, reason: reason.trim(), policyVersion: 'standard-v1',
          ...(kind === 'refund' ? { paymentId, ...(payment?.refundBookingId ? { bookingId: payment.refundBookingId } : {}) } : { bookingId, recipientId: selectedRecipient?.id }) })
        if (!parsed.success) throw new Error('Write a reason between 20 and 500 characters and check the source details.')
        next = parsed.data
      } catch (failure) { setMessage(errorMessage(failure)); return }
    }
    const capturedActor = actorId
    const savedCommand = next
    pending.current = true; setBusy(true); setMessage(null); setRecord({ actorId, command: savedCommand, error: null }); setChecked(false)
    try {
      const confirmation = await submitPendingFinancialCommand(capturedActor, savedCommand)
      if (actor.current === capturedActor) {
        setResult(confirmation.operation)
        setRecord({ actorId: capturedActor, command: confirmation.cleanupPending ? savedCommand : null, error: null })
        setMessage(confirmation.cleanupPending ? 'Your request is confirmed. Its local recovery record could not be cleared; keep this identifier and retry recovery before starting another request.' : 'Your request is recorded for review. Approval and provider payment are separate steps.')
        void workspace.refresh().catch(() => undefined)
      }
    } catch (failure) {
      if (actor.current === capturedActor) {
        setMessage(errorMessage(failure))
        if (!command && failure instanceof ApiError && failure.status >= 400 && failure.status < 500 && failure.code !== 'INVALID_RESPONSE') {
          try { await dismissPendingFinancialCommand(capturedActor); if (actor.current === capturedActor) setRecord({ actorId: capturedActor, command: null, error: null }) }
          catch { setMessage('The server declined this request, but its local recovery record could not be cleared. Check your history before continuing.') }
        }
      }
    } finally { pending.current = false; setBusy(false) }
  }
  async function dismiss(): Promise<void> {
    if (pending.current || !reviewed || !current || !actorId) return
    pending.current = true; setBusy(true)
    try { await dismissPendingFinancialCommand(actorId); setRecord({ actorId, command: null, error: null }); setMessage('The local recovery record was dismissed. This does not cancel any server request.'); setReviewed(false) }
    catch (failure) { setMessage(errorMessage(failure)) }
    finally { pending.current = false; setBusy(false) }
  }
  const ready = kind === 'refund' ? Boolean(payment && BigInt(payment.availableKobo) > BigInt(0)) : Boolean(booking.data && canRequestOrdinaryPayout(booking.data) && selectedRecipient)
  return <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <Stack.Screen options={{ title: 'Financial request', headerShown: true }} />
    <Page title={command ? 'Recover your request' : kind === 'payout' ? 'Request a payout review' : 'Request a refund review'} subtitle="Your request is recorded first. Independent approval and verified provider payment follow separately.">
      {!current ? <StatusView loading message="Checking saved financial instructions…" /> : current.error || command ? <View style={styles.card}>
        <Text style={styles.heading}>{current.error ? 'Recovery needs attention' : 'Saved financial request'}</Text>
        {current.error ? <Text selectable style={styles.warning}>{current.error}</Text> : command ? <><Text selectable style={styles.amount}>{memberAmount(command.amountKobo)} · {command.kind}</Text><Text selectable style={styles.body}>{command.reason}</Text><Text selectable style={styles.help}>Request identifier: {command.clientId}</Text></> : null}
        <Text style={styles.help}>A previous request may already be recorded. Your saved identifier never expires automatically. Check your history before retrying; the retry sends identical instructions.</Text>
        <Button title="Check saved financial history" secondary busy={busy} onPress={() => { void checkHistory() }} />
        {command ? <Button title="Retry exact saved request" disabled={!checked || busy} onPress={() => { void submit() }} /> : null}
        {reviewed ? <><Text style={styles.warning}>Dismissing this recovery record does not cancel a server request. Start another only after checking that it is appropriate.</Text><Button title="Dismiss local recovery record" secondary disabled={busy} onPress={() => { void dismiss() }} /></> : null}
      </View> : result ? null : <>
        {workspace.loading || (kind === 'payout' && booking.loading) || paymentSource.loading ? <StatusView loading message="Loading the request source…" /> : !workspace.data ? <StatusView title="Financial records unavailable" message={workspace.error ?? 'Refresh your financial records.'} onRetry={() => { void workspace.refresh(true).catch(() => undefined) }} /> : <>
          <View style={styles.card}><Text style={styles.heading}>{kind === 'refund' ? 'Payment source' : 'Completed host booking'}</Text>
            {kind === 'refund' ? payment ? <><Text selectable style={styles.help}>Paystack {payment.environment ?? 'unverified'} mode · Payment: {payment.reference}</Text><Text selectable style={styles.body}>Unreserved amount: {memberAmount(payment.availableKobo)}</Text>{paymentSource.error ? <Text style={styles.warning}>Could not refresh: {paymentSource.error}</Text> : null}</> : <><Text style={styles.help}>{paymentSource.error ?? 'Select a collected payment from your financial history.'}</Text>{paymentSource.error ? <Button title="Refresh payment source" secondary onPress={() => { void paymentSource.refresh(true).catch(() => undefined) }} /> : null}</> : booking.data ? <><Text selectable style={styles.body}>{booking.data.listing.location}</Text><Text selectable style={styles.help}>Booking total: {memberAmount(booking.data.amountKobo)}. The server checks collected funds, fees, reports and existing reservations before recording a payout.</Text>{!canRequestOrdinaryPayout(booking.data) ? <Text style={styles.warning}>This booking is not ready for an ordinary payout request. Rentals must be completed; inspections also need both check-ins. Reviewed reports and prior settlement can prevent a payout.</Text> : null}</> : <Text style={styles.warning}>{booking.error ?? 'Open a completed host rental or inspection booking to request a payout.'}</Text>}
            {kind === 'payout' ? recipients.length ? <><Text style={styles.help}>Payout recipient</Text><Host matchContents colorScheme="dark" seedColor={colors.accentBright}><Picker selectedValue={selectedRecipient?.id ?? ''} onValueChange={setRecipientId} enabled={!busy} testID="payout-recipient">{recipients.map(item => <Picker.Item key={item.id} value={item.id} label={`Bank ${item.bankCode} · ending ${item.accountLast4} · ${item.environment} mode`} />)}</Picker></Host></> : <Text style={styles.help}>Add an active bank recipient before requesting a payout.</Text> : null}
            {kind === 'payout' ? <Button title="Manage bank recipients" secondary onPress={() => router.push('/bank-recipient')} /> : null}
          </View>
          {ready ? <View style={styles.card}><Text style={styles.heading}>Request instructions</Text><Field label="Amount in naira" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" inputMode="decimal" placeholder={koboToNaira(kind === 'refund' ? payment!.availableKobo : booking.data!.amountKobo)} editable={!busy} maxLength={18} />
            <Field label="Reason for this request" value={reason} onChangeText={setReason} multiline maxLength={500} editable={!busy} placeholder="Explain why this refund or payout needs review." />
            <Text style={styles.help}>Standard reviewed policy. This form does not apply holding-default compensation or initiate a bank transfer.</Text><Button title="Submit request for review" busy={busy} onPress={() => { void submit() }} /></View> : null}
          {workspace.error || workspace.moreError ? <Text accessibilityRole="alert" style={styles.warning}>{workspace.error ?? workspace.moreError}</Text> : null}
        </>}
      </>}
      {result ? <FinancialOperationCard operation={result} /> : null}
      {message ? <Text selectable accessibilityLiveRegion="polite" style={styles.warning}>{message}</Text> : null}
      <Button title="View financial history" secondary onPress={() => router.push('/financial')} />
    </Page>
  </KeyboardAvoidingView>
}
const styles = StyleSheet.create({ keyboard: { flex: 1, backgroundColor: colors.background }, card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, padding: space.xl, gap: space.lg },
  heading: { color: colors.text, fontFamily: fonts.semibold, fontSize: 20 }, body: { color: colors.secondary, fontFamily: fonts.regular, fontSize: 14, lineHeight: 23 }, help: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 21 },
  warning: { color: colors.warning, fontFamily: fonts.medium, fontSize: 13, lineHeight: 22 }, amount: { color: colors.accentBright, fontFamily: fonts.bold, fontSize: 22, fontVariant: ['tabular-nums'] } })
