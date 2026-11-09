import { useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Stack, router, useLocalSearchParams } from 'expo-router'
import * as DocumentPicker from 'expo-document-picker'
import { Directory, File, Paths } from 'expo-file-system'
import * as Crypto from 'expo-crypto'
import { z } from 'zod'
import { renewalArchiveSchema, terminationArchiveSchema, type MemberRenewal, type MemberTermination } from '../../../../lib/contracts/lifecycle'
import { Page } from '../../src/components/Page'
import { Button } from '../../src/components/Button'
import { Field } from '../../src/components/Field'
import { StatusView } from '../../src/components/StatusView'
import { useMemberPages, useMemberResource } from '../../src/hooks/use-member-resource'
import { useAuth } from '../../src/providers/AuthProvider'
import { bookingDetailSchema } from '../../src/lib/booking-contracts'
import { bookingOutcomeUncertain } from '../../src/lib/booking-api'
import { errorMessage } from '../../src/lib/api'
import { decideLeaseRequest, leaseRequestedInstant, leaseRequestInput, openLeaseEvidence, submitLeaseRequest, type LeaseRequestKind } from '../../src/lib/lifecycle-api'
import { prepareNativeListingUpload, uploadPreparedNativeListingFile, type NativeListingUpload } from '../../src/lib/native-upload'
import { confirmOwnedUpload } from '../../src/lib/owner-listing-api'
import { memberDate, memberStatus } from '../../src/lib/member-format'
import { colors, fonts, radius, space } from '../../src/theme'

type Evidence = { file: NativeListingUpload; state: 'prepared' | 'unknown' | 'uploaded'; name: string }
export default function LeaseScreen() {
  const params = useLocalSearchParams<{ id: string }>()
  const id = typeof params.id === 'string' ? params.id : ''
  const valid = z.uuid().safeParse(id).success
  const { session } = useAuth()
  const booking = useMemberResource(`/bookings/${encodeURIComponent(id)}`, bookingDetailSchema, valid)
  const renewals = useMemberPages(`/renewals?bookingId=${encodeURIComponent(id)}`, renewalArchiveSchema, valid)
  const terminations = useMemberPages(`/terminations?bookingId=${encodeURIComponent(id)}`, terminationArchiveSchema, valid)
  const [kind, setKind] = useState<LeaseRequestKind>('renewal')
  const [date, setDate] = useState(''), [time, setTime] = useState('10:00')
  const [reference, setReference] = useState(''), [direct, setDirect] = useState(false)
  const [reason, setReason] = useState(''), [decisionReason, setDecisionReason] = useState('')
  const [evidence, setEvidence] = useState<Evidence | null>(null)
  const [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const pending = useRef(false)
  const historyReady = Boolean(renewals.data && terminations.data && !renewals.error && !terminations.error)
  const hasPending = [...renewals.items, ...terminations.items].some(item => ['pending_counterparty', 'pending_review'].includes(item.status) || ('releasedAt' in item && item.status === 'approved' && !item.releasedAt))
  const rental = booking.data
  const canRenew = rental?.listing.category === 'house' && rental.role === 'renter' && ['confirmed', 'completed'].includes(rental.status)
  const canEnd = rental?.listing.category === 'house' && rental.status === 'confirmed'
  const mode: LeaseRequestKind = canRenew ? kind : 'termination'
  const formAllowed = Boolean(rental && (canRenew || canEnd) && historyReady && !hasPending)
  async function refresh(): Promise<void> {
    if (pending.current) return
    pending.current = true; setBusy(true)
    try { await Promise.all([booking.refresh(), renewals.refresh(), terminations.refresh()]); setUncertain(false); setMessage('Current lease and request history loaded. Compare the recorded result before sending another proposal.') }
    catch (error) { setMessage(errorMessage(error)) }
    finally { pending.current = false; setBusy(false) }
  }
  async function chooseEvidence(): Promise<void> {
    if (pending.current || uncertain || !session) return
    pending.current = true; setBusy(true); setMessage(null)
    try {
      const chosen = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'], copyToCacheDirectory: true, multiple: false })
      if (chosen.canceled) return
      const source = chosen.assets[0]
      const prepared = prepareNativeListingUpload(source.uri, 'document', session.user.id, source.mimeType)
      const extension = prepared.path.split('.').at(-1)!
      const folder = new Directory(Paths.document, 'rentral-lease-evidence', session.user.id, id)
      folder.create({ intermediates: true, idempotent: true })
      const saved = new File(folder, `${Crypto.randomUUID()}.${extension}`)
      await new File(source.uri).copy(saved)
      setEvidence({ file: prepareNativeListingUpload(saved.uri, 'document', session.user.id, prepared.contentType, prepared.path), state: 'prepared', name: source.name })
    } catch (error) { setMessage(errorMessage(error)) }
    finally { pending.current = false; setBusy(false) }
  }
  async function uploadEvidence(): Promise<void> {
    if (!evidence || pending.current || !session || uncertain) return
    pending.current = true; setBusy(true); setMessage(null)
    try {
      if (evidence.state === 'unknown') {
        try { await confirmOwnedUpload('compliance-docs', evidence.file.path, evidence.file, session.user.id); setEvidence({ ...evidence, state: 'uploaded' }); setMessage('Supporting evidence is uploaded.'); return }
        catch (error) { if (!(error && typeof error === 'object' && 'status' in error && error.status === 404)) throw error }
      }
      setEvidence({ ...evidence, state: 'unknown' })
      await uploadPreparedNativeListingFile(evidence.file, session.user.id)
      await confirmOwnedUpload('compliance-docs', evidence.file.path, evidence.file, session.user.id)
      setEvidence({ ...evidence, state: 'uploaded' }); setMessage('Supporting evidence is uploaded. You can now submit your proposal.')
    } catch (error) { setMessage(errorMessage(error)) }
    finally { pending.current = false; setBusy(false) }
  }
  async function submit(): Promise<void> {
    if (pending.current || uncertain || !formAllowed || !session || evidence?.state !== 'uploaded') return
    let body: ReturnType<typeof leaseRequestInput>
    try {
      const end = leaseRequestedInstant(date, time)
      body = leaseRequestInput(mode, mode === 'renewal' ? { bookingId: id, reference, recipientRoute: direct ? 'direct_landlord' : 'original_agent', requestedEndsAt: end, evidencePath: evidence.file.path }
        : { bookingId: id, requestedEndAt: end, reason, evidencePath: evidence.file.path })
    } catch (error) { setMessage(errorMessage(error)); return }
    pending.current = true; setBusy(true); setMessage(null)
    try {
      await submitLeaseRequest(mode, body, session.user.id)
      setUncertain(true)
      await Promise.all([renewals.refresh(), terminations.refresh()])
      setUncertain(false); setMessage('Your proposal is recorded. The counterparty and independent reviewer must complete the remaining decisions.')
    } catch (error) { if (bookingOutcomeUncertain(error)) setUncertain(true); setMessage(errorMessage(error)) }
    finally { pending.current = false; setBusy(false) }
  }
  async function decide(item: MemberRenewal | MemberTermination, requestKind: LeaseRequestKind, decision: 'accept' | 'reject'): Promise<void> {
    if (pending.current || uncertain || !session) return
    pending.current = true; setBusy(true); setMessage(null)
    try { await decideLeaseRequest(requestKind, item.id, { decision, reason: decisionReason }, session.user.id); setUncertain(true); await Promise.all([renewals.refresh(), terminations.refresh(), booking.refresh()]); setUncertain(false); setDecisionReason(''); setMessage('Your decision is recorded. Approved changes still require independent staff review.') }
    catch (error) { if (bookingOutcomeUncertain(error)) setUncertain(true); setMessage(errorMessage(error)) }
    finally { pending.current = false; setBusy(false) }
  }
  function requestCard(item: MemberRenewal | MemberTermination, requestKind: LeaseRequestKind) {
    const end = 'requestedEndsAt' in item ? item.requestedEndsAt : item.requestedEndAt
    return <View key={item.id} style={styles.card}><Text style={styles.heading}>{requestKind === 'renewal' ? 'Extension' : 'Early end'} · {memberStatus(item.status)}</Text>
      <Text selectable style={styles.help}>Request ID: {item.id}</Text><Text style={styles.body}>Requested end: {end ? memberDate(end) : 'More details needed'}</Text>
      {'reference' in item ? <Text style={styles.help}>Reference: {item.reference}. Supporting evidence is recorded; payment has not been verified through a provider.</Text> : <Text style={styles.body}>{item.reason}</Text>}
      {item.decisionReason ? <Text style={styles.body}>Review reason: {item.decisionReason}</Text> : null}
      {'counterpartyReason' in item && item.counterpartyReason ? <Text style={styles.body}>Counterparty: {item.counterpartyReason}</Text> : null}
      {item.evidenceEndpoint ? <Button title="Open supporting evidence" secondary disabled={busy} onPress={() => { if (session) void openLeaseEvidence(requestKind, item.id, session.user.id).catch(error => setMessage(errorMessage(error))) }} /> : null}
      {item.actions.confirm ? <><Field label="Reason for your lease decision" value={decisionReason} onChangeText={setDecisionReason} multiline maxLength={2000} editable={!busy && !uncertain} />
        <Button title="Agree to this proposal" busy={busy} disabled={uncertain || decisionReason.trim().length < 15} onPress={() => { void decide(item, requestKind, 'accept') }} />
        <Button title="Decline this proposal" secondary disabled={busy || uncertain || decisionReason.trim().length < 15} onPress={() => { void decide(item, requestKind, 'reject') }} /></> : null}
    </View>
  }
  return <Page title="Manage this lease" subtitle="Keep the dates, supporting evidence and review history together." refreshing={busy} onRefresh={() => { void refresh() }}>
    <Stack.Screen options={{ title: 'Manage lease', headerShown: true }} />
    {!valid ? <StatusView title="Lease unavailable" message="Choose a residential booking from your bookings." /> : booking.loading ? <StatusView loading message="Loading this lease…" /> : !rental ? <StatusView title="Lease unavailable" message={booking.error ?? 'Open your bookings and choose this lease again.'} onRetry={() => { void refresh() }} /> : <>
      <View style={styles.card}><Text style={styles.heading}>{rental.listing.location}</Text><Text style={styles.body}>{memberStatus(rental.status)} · You are the {rental.role}</Text><Text style={styles.help}>Recorded lease end: {memberDate(rental.endsAt)}</Text><Button title="View booking details" secondary onPress={() => router.push({ pathname: '/booking/[id]', params: { id } })} /></View>
      {message ? <Text selectable accessibilityRole="alert" style={styles.warning}>{message}</Text> : null}
      {uncertain ? <><Text style={styles.help}>The result needs confirmation. Your form and uploaded file are kept here. Check the recorded history before another action.</Text><Button title="Check lease request history" secondary busy={busy} onPress={() => { void refresh() }} /></> : null}
      {!historyReady ? <StatusView loading={renewals.loading || terminations.loading} title="Request history unavailable" message={renewals.error ?? terminations.error ?? 'Load both histories before submitting a proposal.'} onRetry={() => { void refresh() }} /> : null}
      {formAllowed ? <View style={styles.card}><Text style={styles.heading}>Propose a change</Text>
        {canRenew && canEnd ? <View style={styles.group}><Button title="Request extension" secondary={mode !== 'renewal'} disabled={busy || uncertain} onPress={() => setKind('renewal')} /><Button title="Request early end" secondary={mode !== 'termination'} disabled={busy || uncertain} onPress={() => setKind('termination')} /></View> : null}
        <Text style={styles.body}>{mode === 'renewal' ? 'An extension needs host agreement and independent review. Existing payment records stay separate.' : 'An early end needs agreement from the other lease participant and independent review. It does not automatically issue a refund.'}</Text>
        <Field label="Proposed lease end date (YYYY-MM-DD)" value={date} onChangeText={setDate} placeholder="2027-12-01" maxLength={10} editable={!busy && !uncertain} />
        <Field label="Proposed end time on this device (HH:MM)" value={time} onChangeText={setTime} placeholder="10:00" maxLength={5} editable={!busy && !uncertain} />
        <Text style={styles.help}>Time zone: {Intl.DateTimeFormat().resolvedOptions().timeZone}</Text>
        {mode === 'renewal' ? <><Field label="External renewal payment reference" value={reference} onChangeText={setReference} maxLength={150} editable={!busy && !uncertain} /><Button title={direct ? 'Paid directly to landlord' : 'Paid through original agent'} secondary disabled={busy || uncertain} onPress={() => setDirect(!direct)} /></> : <Field label="Reason for ending this lease early" value={reason} onChangeText={setReason} multiline maxLength={4000} editable={!busy && !uncertain} />}
        <Text style={styles.help}>Attach supporting evidence as PDF, JPG, PNG or WebP, up to 10 MB.</Text>
        <Button title={evidence ? 'Choose different supporting evidence' : 'Choose supporting evidence'} secondary disabled={busy || uncertain || evidence?.state === 'unknown'} onPress={() => { void chooseEvidence() }} />
        {evidence ? <><Text style={styles.help}>{evidence.name} · {evidence.state === 'uploaded' ? 'Uploaded' : evidence.state === 'unknown' ? 'Upload needs confirmation' : 'Ready to upload'}</Text>{evidence.state !== 'uploaded' ? <Button title={evidence.state === 'unknown' ? 'Check or resume evidence upload' : 'Upload supporting evidence'} secondary busy={busy} disabled={uncertain} onPress={() => { void uploadEvidence() }} /> : null}</> : null}
        <Button title={mode === 'renewal' ? 'Submit lease extension proposal' : 'Submit early-end proposal'} busy={busy} disabled={uncertain || evidence?.state !== 'uploaded'} onPress={() => { void submit() }} />
      </View> : historyReady ? <Text style={styles.help}>{hasPending ? 'Follow the existing proposal below before requesting another change.' : 'New proposals require an eligible residential lease. Your existing request history remains available.'}</Text> : null}
      <Text accessibilityRole="header" style={styles.heading}>Extension history</Text>{renewals.items.map(item => requestCard(item, 'renewal'))}
      {renewals.hasMore ? <Button title="Older extensions for this lease" secondary busy={renewals.loadingMore} onPress={() => { void renewals.loadMore() }} /> : null}
      <Text accessibilityRole="header" style={styles.heading}>Early-end history</Text>{terminations.items.map(item => requestCard(item, 'termination'))}
      {terminations.hasMore ? <Button title="Older early-end requests for this lease" secondary busy={terminations.loadingMore} onPress={() => { void terminations.loadMore() }} /> : null}
    </>}
  </Page>
}
const styles = StyleSheet.create({ card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, padding: space.xl, gap: space.lg }, group: { gap: space.md }, heading: { color: colors.text, fontFamily: fonts.semibold, fontSize: 20 }, body: { color: colors.secondary, fontFamily: fonts.regular, fontSize: 14, lineHeight: 23 }, help: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 21 }, warning: { color: colors.warning, fontFamily: fonts.medium, fontSize: 13, lineHeight: 22 } })
