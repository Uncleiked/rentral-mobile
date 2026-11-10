import { useCallback, useMemo, useRef, useState } from 'react'
import { Linking, StyleSheet, Text, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { Button } from './Button'
import { StatusView } from './StatusView'
import { useActorGuard } from '../hooks/use-actor-guard'
import { useMemberResource } from '../hooks/use-member-resource'
import { canOpenPublicationCheckout, canReopenPublicationCheckout, currentPublicationFeeVerified, loadPublicationFee, publicationFeeFor, publicationFeePath, type PreparedPublicationCheckout, type PublicationFee } from '../lib/listing-fee-api'
import { beginPublicationCheckout, loadListingFeeRecovery, reviewPublicationPayment, verifyPublicationPayment, type ListingFeeRecovery } from '../lib/listing-fee-recovery'
import { errorMessage } from '../lib/api'
import { memberAmount, memberStatus } from '../lib/member-format'
import { colors, fonts, radius, space } from '../theme'

export function ListingPublicationFee({ listingId }: { listingId: string }) {
  const { actorId, isCurrent } = useActorGuard(), schema = useMemo(() => publicationFeeFor(listingId), [listingId])
  const resource = useMemberResource(publicationFeePath(listingId), schema)
  const [recovery, setRecovery] = useState<{ actorId: string; listingId: string; value: ListingFeeRecovery | null; error: string | null } | null>(null)
  const [busy, setBusy] = useState<string | null>(null), [message, setMessage] = useState<string | null>(null), [failed, setFailed] = useState(false), [prepared, setPrepared] = useState<(PreparedPublicationCheckout & { base: PublicationFee }) | null>(null)
  const pending = useRef(false), current = recovery?.actorId === actorId && recovery.listingId === listingId ? recovery : null
  const recovering = Boolean(current?.value || current?.error), fee = resource.data
  // Any new readback invalidates the old rendered capability. Explicit reopening
  // obtains fresh state and renews it only for the exact same actor/listing/intent.
  const currentPrepared = prepared && fee && fee === prepared.base && canReopenPublicationCheckout(fee, prepared, actorId, listingId) ? prepared : null
  const restore = useCallback(async () => {
    try { const value = await loadListingFeeRecovery(actorId, listingId); if (isCurrent(actorId)) setRecovery({ actorId, listingId, value, error: null }) }
    catch (reason) { if (isCurrent(actorId)) setRecovery({ actorId, listingId, value: null, error: errorMessage(reason) }) }
  }, [actorId, listingId, isCurrent])
  useFocusEffect(useCallback(() => { if (actorId) void restore() }, [actorId, restore]))
  async function action(name: string, work: () => Promise<void>) {
    if (pending.current || !isCurrent(actorId)) return
    pending.current = true; setBusy(name); setMessage(null); setFailed(false)
    try { await work() }
    catch (reason) { if (isCurrent(actorId)) { setFailed(true); setMessage(errorMessage(reason)) } }
    finally { await restore(); pending.current = false; if (isCurrent(actorId)) setBusy(null) }
  }
  async function open(checkout: PreparedPublicationCheckout) {
    if (!isCurrent(actorId)) return
    const latest = await loadPublicationFee(listingId, actorId)
    if (!isCurrent(actorId)) return
    resource.replace(latest)
    if (!canReopenPublicationCheckout(latest, checkout, actorId, listingId)) { setPrepared(null); throw new Error('The current payment no longer matches this prepared checkout. Check its status before continuing.') }
    setPrepared({ ...checkout, base: latest })
    try { await Linking.openURL(checkout.url); if (isCurrent(actorId)) setMessage('Paystack opened in your browser. Returning does not confirm payment; check the server status, then verify with Paystack if needed.') }
    catch { if (isCurrent(actorId)) { setFailed(true); setMessage('Checkout is prepared, but the browser could not open. Open the same prepared checkout below; no second charge was requested.') } }
  }
  function checkout() {
    if (recovering || !current || !fee || !canOpenPublicationCheckout(fee) || resource.error) return
    void action('checkout', async () => {
      const result = await beginPublicationCheckout(actorId, listingId)
      if (!isCurrent(actorId)) return
      await open({ ...result, actorId, listingId })
    })
  }
  function review() {
    void action('review', async () => {
      const result = await reviewPublicationPayment(actorId, listingId)
      if (!isCurrent(actorId)) return
      resource.replace(result.fee)
      setMessage(result.cleanupPending ? 'Server status is shown, but the private recovery record could not be cleared. Check again before another payment action.' : 'The latest server payment status is shown. No checkout or provider verification was automatically repeated.')
      setFailed(result.cleanupPending)
    })
  }
  function verify() {
    const payment = fee?.payment
    if (!payment || !fee.actions.reconcile || recovering || !current || resource.error) return
    void action('verify', async () => {
      const result = await verifyPublicationPayment(actorId, listingId, payment.reference)
      if (!isCurrent(actorId)) return
      resource.replace(result.fee)
      setMessage(result.cleanupPending ? 'The provider result is shown, but recovery cleanup needs attention. Check the server status again.' : currentPublicationFeeVerified(result.fee) ? 'The provider verified the publication fee. Asset, address and media review still determine publication.' : 'The latest recorded payment result is shown. The listing was not automatically published.')
      setFailed(result.cleanupPending)
    })
  }
  return <View style={styles.card}>
    <Text accessibilityRole="header" style={styles.heading}>Publication fee</Text>
    <Text style={styles.help}>The fee is separate from asset, address and media approval. Paying does not publish a listing or guarantee approval.</Text>
    {resource.loading ? <StatusView loading message="Checking publication payment…" /> : !fee ? <StatusView title="Publication payment unavailable" message={resource.error ?? 'Check the server status before paying.'} onRetry={review} /> : <>
      <Text selectable style={styles.amount}>{fee.waived ? 'Publication fee waived' : <>{memberAmount(fee.amountKobo)} <Text style={styles.help}>{fee.currency}</Text></>}</Text>
      {fee.waived ? <Text style={styles.notice}>An administrator waived the publication fee for this listing. No fee payment is required. Document, media and publication review remain separate.</Text> : <Text style={styles.body}>Paystack mode: {fee.environment === 'test' ? 'Test — no live payment' : fee.environment === 'live' ? 'Live payment' : 'Unavailable'}</Text>}
      {fee.payment ? <Text selectable style={styles.body}>Recorded payment: {memberStatus(fee.payment.status)}</Text> : !fee.waived ? <Text style={styles.body}>No publication payment is recorded.</Text> : null}
      {fee.payment ? <><Text selectable style={styles.help}>Payment reference: {fee.payment.reference}</Text><Text style={styles.help}>Recorded mode: {fee.payment.environment ?? 'Unverified legacy mode'}{fee.payment.paidAt ? ` · Confirmed ${new Date(fee.payment.paidAt).toLocaleString()}` : ''}</Text></> : null}
      {fee.environment && fee.payment && fee.payment.environment !== fee.environment && !['failed', 'abandoned'].includes(fee.payment.status) ? <Text style={styles.warning}>This payment belongs to a different or unverified Paystack mode. Do not pay again; its recorded mode must be reconciled first.</Text> : null}
      {!fee.waived && currentPublicationFeeVerified(fee) ? <Text style={styles.notice}>Publication fee verified. Staff review and media readiness remain separate.</Text> : fee.payment?.status === 'succeeded' ? <Text style={styles.help}>A successful fee payment is recorded in {fee.payment.environment ?? 'unverified legacy'} mode. It does not establish verification for the current payment configuration. Publication review remains separate.</Text> : fee.payment && ['requires_review', 'uncertain', 'initializing', 'reversed'].includes(fee.payment.status) ? <Text style={styles.warning}>This payment needs confirmation or review. Do not start another payment.</Text> : null}
      {!fee.waived && !fee.paymentAvailable ? <Text style={styles.help}>Online checkout is unavailable. The existing recorded payment status remains visible; verification is available only when its button is shown.</Text> : null}
      {fee.archived ? <Text style={styles.help}>Restore the listing before requesting a new checkout.</Text> : fee.listingStatus !== 'pending_verification' && fee.payment?.status !== 'succeeded' ? <Text style={styles.help}>A submitted listing awaiting review is required for a new publication checkout.</Text> : null}
      {fee.actions.checkout ? <Button title={fee.payment ? 'Open publication checkout with Paystack' : 'Pay publication fee with Paystack'} busy={busy === 'checkout'} disabled={Boolean(busy) || !current || recovering || Boolean(resource.error) || !canOpenPublicationCheckout(fee)} onPress={checkout} /> : null}
      {fee.actions.reconcile ? <Button title="Verify publication payment with Paystack" secondary busy={busy === 'verify'} disabled={Boolean(busy) || !current || recovering || Boolean(resource.error)} onPress={verify} /> : null}
    </>}
    {currentPrepared ? <Button title="Open same prepared publication checkout" secondary disabled={Boolean(busy) || Boolean(resource.error)} onPress={() => { void action('open', () => open(currentPrepared)) }} /> : null}
    {recovering ? <><Text accessibilityRole="alert" style={styles.warning}>{current?.error ?? 'A previous publication payment action may already be recorded. Check the server status before another action. Rentral does not retry it automatically.'}</Text></> : null}
    <Button title="Check publication payment server status" secondary busy={busy === 'review'} disabled={Boolean(busy)} onPress={review} />
    {resource.error && fee ? <Text style={styles.warning}>Could not refresh: {resource.error}</Text> : null}
    {message ? <Text selectable accessibilityLiveRegion="polite" style={failed ? styles.warning : styles.notice}>{message}</Text> : null}
  </View>
}
const styles = StyleSheet.create({ card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, padding: space.xl, gap: space.lg }, heading: { color: colors.text, fontFamily: fonts.semibold, fontSize: 20 }, amount: { color: colors.accentBright, fontFamily: fonts.bold, fontSize: 25, fontVariant: ['tabular-nums'] }, body: { color: colors.secondary, fontFamily: fonts.medium, fontSize: 14, lineHeight: 23 }, help: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 21 }, warning: { color: colors.warning, fontFamily: fonts.medium, fontSize: 13, lineHeight: 22 }, notice: { color: colors.accentBright, fontFamily: fonts.medium, fontSize: 13, lineHeight: 22 } })
