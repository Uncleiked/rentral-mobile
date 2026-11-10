import { useCallback, useRef, useState } from 'react'
import { KeyboardAvoidingView, Linking, Platform, StyleSheet, Text, View } from 'react-native'
import { Host, Picker } from '@expo/ui'
import { Stack, useFocusEffect } from 'expo-router'
import * as Crypto from 'expo-crypto'
import { adminCommandSchema, adminDashboardSchema, adminListingSchema, adminUsersSchema, type AdminCommand, type AdminListing, type AdminUser } from '../../../lib/contracts/admin'
import { Page } from '../src/components/Page'
import { Button } from '../src/components/Button'
import { ChoiceChips } from '../src/components/ChoiceChips'
import { Field } from '../src/components/Field'
import { StatusView } from '../src/components/StatusView'
import { useMemberResource } from '../src/hooks/use-member-resource'
import { useAuth } from '../src/providers/AuthProvider'
import { loadAdminDocument, nativeAdminDocumentUrl } from '../src/lib/admin-api'
import { checkPendingAdminCommand, dismissPendingAdminCommand, loadPendingAdminCommand, retryPendingAdminCommand, submitNewAdminCommand } from '../src/lib/admin-pending-store'
import { errorMessage } from '../src/lib/api'
import { memberStatus } from '../src/lib/member-format'
import { config } from '../src/lib/config'
import { previewPrivateDocument } from '../src/lib/private-document'
import { colors, fonts, radius, space } from '../src/theme'

type Tab = 'listings' | 'people' | 'inspections' | 'audit'
const operationLabels: Record<AdminCommand['operation'], string> = { approve_document: 'Approve document', reject_document: 'Reject document', publish: 'Publish listing', suspend_listing: 'Suspend listing', waive_fee: 'Waive listing fee', revoke_fee_waiver: 'Revoke fee waiver', change_role: 'Change staff role', set_gallery_permission: 'Change gallery permission', suspend_user: 'Suspend account', restore_user: 'Restore account', review_manual_inspection: 'Review manual inspection', transfer_ownership: 'Transfer ownership' }

export default function AdminScreen() {
  const { session } = useAuth(), actorId = session?.user.id ?? ''
  const dashboard = useMemberResource('/admin', adminDashboardSchema)
  const [tab, setTab] = useState<Tab>('listings'), [selectedId, setSelectedId] = useState('')
  const listing = useMemberResource(`/admin/listings/${encodeURIComponent(selectedId)}`, adminListingSchema, Boolean(selectedId))
  const [query, setQuery] = useState(''), [search, setSearch] = useState<string | null>(null)
  const people = useMemberResource(`/admin/users?query=${encodeURIComponent(search ?? '')}`, adminUsersSchema, search !== null)
  const [reason, setReason] = useState(''), [role, setRole] = useState('member'), [ownerOverride, setOwnerOverride] = useState(false)
  const [proposal, setProposal] = useState<AdminCommand | null>(null)
  const [recovery, setRecovery] = useState<{ actorId: string; command: AdminCommand | null; error: string | null } | null>(null)
  const [busy, setBusy] = useState(false), [missing, setMissing] = useState(false), [reviewedAudit, setReviewedAudit] = useState(false), [message, setMessage] = useState<string | null>(null)
  const lock = useRef(false), activeActor = useRef('')
  useFocusEffect(useCallback(() => {
    activeActor.current = actorId
    let active = true
    if (actorId) void loadPendingAdminCommand(actorId).then(command => { if (active) { setRecovery({ actorId, command, error: null }); setMissing(false) } }, failure => { if (active) setRecovery({ actorId, command: null, error: errorMessage(failure) }) })
    return () => { active = false; activeActor.current = '' }
  }, [actorId]))
  const current = recovery?.actorId === actorId ? recovery : null
  const disabled = busy || Boolean(current?.command || current?.error || proposal)
  const has = (permission: string) => Boolean(dashboard.data?.permissions.includes(permission))
  const selected = listing.data?.id === selectedId ? listing.data : dashboard.data?.listings.find(item => item.id === selectedId)

  function propose(operation: AdminCommand['operation'], targetId: string, expectedRevision: number, extra: Record<string, unknown> = {}) {
    if (disabled || !current || !dashboard.data) return
    const input = adminCommandSchema.safeParse({ operation, clientId: Crypto.randomUUID(), targetId, expectedRevision, reason, ...extra })
    if (!input.success) { setMessage(input.error.issues[0]?.message ?? 'Write a decision reason and check these details.'); return }
    setProposal(input.data); setMessage(null)
  }
  async function reloadRecovery() {
    const command = await loadPendingAdminCommand(actorId)
    if (activeActor.current === actorId) setRecovery({ actorId, command, error: null })
  }
  async function refreshAfterDecision() {
    const results = await Promise.allSettled([dashboard.refresh(true), ...(selectedId ? [listing.refresh(true)] : []), ...(search !== null ? [people.refresh(true)] : [])])
    return results.every(result => result.status === 'fulfilled')
  }
  async function confirm(retry = false) {
    const command = retry ? current?.command : proposal
    if (lock.current || !command || !actorId || (retry && !missing)) return
    lock.current = true; setBusy(true); setMessage(null)
    try {
      const result = retry ? await retryPendingAdminCommand(actorId, command.clientId) : await submitNewAdminCommand(actorId, command)
      if (activeActor.current !== actorId) return
      setProposal(null); setReason(''); setOwnerOverride(false); setMissing(false)
      await reloadRecovery()
      const refreshed = await refreshAfterDecision()
      if (activeActor.current === actorId) setMessage(`Decision confirmed and recorded in the audit.${result.cleanupPending ? ' Device recovery still needs receipt confirmation.' : ''}${refreshed ? '' : ' Refresh the workspace to load the latest records.'}`)
    } catch (failure) {
      if (activeActor.current === actorId) { setProposal(null); setMessage(errorMessage(failure)); await reloadRecovery().catch(() => undefined) }
    } finally { lock.current = false; if (activeActor.current === actorId) setBusy(false) }
  }
  async function checkSaved() {
    if (lock.current || !actorId) return
    lock.current = true; setBusy(true); setMessage(null)
    try {
      const result = await checkPendingAdminCommand(actorId)
      if (activeActor.current !== actorId) return
      setMissing(!result.found); await reloadRecovery()
      if (result.found) { await refreshAfterDecision(); setMessage('The original decision is confirmed. No command was repeated.') }
      else setMessage('No committed receipt was found. Review the latest audit/target, then explicitly retry these original instructions or clear their device recovery.')
    } catch (failure) { if (activeActor.current === actorId) setMessage(errorMessage(failure)) }
    finally { lock.current = false; if (activeActor.current === actorId) setBusy(false) }
  }
  async function reviewHistory() {
    if (lock.current) return
    lock.current = true; setBusy(true)
    try { await dashboard.refresh(true); if (activeActor.current === actorId) { setTab('audit'); setReviewedAudit(true); setMessage('Current audit history is loaded. Inspect it and the affected record before clearing an unresolved request.') } }
    catch (failure) { if (activeActor.current === actorId) setMessage(errorMessage(failure)) }
    finally { lock.current = false; if (activeActor.current === actorId) setBusy(false) }
  }
  async function dismissRecovery() {
    if (lock.current || !reviewedAudit || (!missing && !current?.error)) return
    lock.current = true; setBusy(true)
    try { await dismissPendingAdminCommand(actorId); await reloadRecovery(); setMissing(false); setReviewedAudit(false); setMessage('Device recovery was cleared. This does not undo any server decision or audit history.') }
    catch (failure) { setMessage(errorMessage(failure)) }
    finally { lock.current = false; setBusy(false) }
  }
  async function previewDocument(value: AdminListing) {
    if (lock.current || !value.document.present) return
    lock.current = true; setBusy(true); setMessage(null)
    try {
      const document = await loadAdminDocument(value.id, actorId), url = nativeAdminDocumentUrl(document, config.apiUrl)
      if (activeActor.current !== actorId) return
      if (!url) throw new Error('The private document link could not be confirmed. Refresh and request it again.')
      await previewPrivateDocument(url, value.lister.id)
      setMessage('Private document opened. Read the exact file before making a reasoned decision. The link expires shortly.')
    } catch (failure) { if (activeActor.current === actorId) setMessage(errorMessage(failure)) }
    finally { lock.current = false; if (activeActor.current === actorId) setBusy(false) }
  }
  async function openWeb(path: string) {
    try { await Linking.openURL(`${config.apiUrl}${path}`) } catch { setMessage('The web workspace could not be opened. Try again.') }
  }
  function userCard(user: AdminUser) {
    return <View key={user.id} style={styles.card}><Text selectable style={styles.heading}>{user.username ? `@${user.username}` : user.email}</Text><Text selectable style={styles.help}>{user.email}</Text><Text style={styles.help}>{user.role} · {user.closed ? 'Closed' : user.suspended ? 'Suspended' : 'Active'} · Gallery {user.galleryAllowed ? 'approved' : 'not approved'}</Text>
      {has('gallery:manage') && !user.closed ? <Button title={user.galleryAllowed ? 'Revoke gallery permission' : 'Approve gallery uploads'} secondary disabled={disabled || (user.id === actorId && user.role === 'owner' && !ownerOverride)} onPress={() => propose('set_gallery_permission', user.id, user.revision, { allowed: !user.galleryAllowed, ...(user.id === actorId && user.role === 'owner' ? { ownerOverride } : {}) })} /> : null}
      {has('user:manage') && !user.closed && user.role !== 'owner' ? <Button title={user.suspended ? 'Restore account' : 'Suspend account'} secondary disabled={disabled || user.id === actorId} onPress={() => propose(user.suspended ? 'restore_user' : 'suspend_user', user.id, user.revision)} /> : null}
      {has('staff:manage') && user.role !== 'owner' && !user.closed ? <><Text style={styles.help}>Choose the new role below before reviewing the change.</Text><Button title={`Set role to ${role}`} secondary disabled={disabled || user.id === actorId} onPress={() => propose('change_role', user.id, user.revision, { role })} /></> : null}
    </View>
  }
  return <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <Stack.Screen options={{ title: 'Admin', headerShown: true, gestureEnabled: !busy, headerBackVisible: !busy }} />
    <Page title="Rentral administration" subtitle="Review evidence, manage access and keep an accountable decision history." refreshing={dashboard.refreshing} onRefresh={() => { void dashboard.refresh(true).catch(() => undefined) }}>
      {dashboard.loading ? <StatusView loading message="Checking your current administrative access…" /> : !dashboard.data ? <StatusView title="Administration unavailable" message={dashboard.error ?? 'Your current account does not have access.'} onRetry={() => { void dashboard.refresh(true).catch(() => undefined) }} /> : <>
        <Text style={styles.help}>Current role: {dashboard.data.role}. Every decision is checked again on the server. A fee waiver is recorded as waived, never as a payment.</Text>
        {dashboard.error ? <Text accessibilityRole="alert" style={styles.warning}>Could not refresh: {dashboard.error}. Refresh before preparing another decision.</Text> : null}
        {current?.command || current?.error ? <View style={styles.card}><Text style={styles.heading}>A decision needs confirmation</Text><Text selectable style={styles.help}>{current.command ? `${operationLabels[current.command.operation]} · ${current.command.targetId}\nRequest ${current.command.clientId}\n${current.command.reason}` : current.error}</Text>
          {current.command ? <><Button title="Check original decision receipt" secondary busy={busy} onPress={() => { void checkSaved() }} /><Button title="Retry exact saved decision" disabled={busy || !missing} onPress={() => { void confirm(true) }} /></> : null}
          <Button title="Review current audit history" secondary disabled={busy} onPress={() => { void reviewHistory() }} />
          {reviewedAudit && (missing || current.error) ? <Button title="Clear reviewed device recovery" secondary disabled={busy} onPress={() => { void dismissRecovery() }} /> : null}
        </View> : null}
        <ChoiceChips label="Workspace" value={tab} options={[{ value: 'listings', label: 'Listings' }, { value: 'people', label: 'People' }, { value: 'inspections', label: 'Inspections' }, { value: 'audit', label: 'Audit' }]} disabled={busy} onChange={setTab} />
        {tab !== 'audit' ? <View style={styles.card}><Field label="Decision reason" value={reason} onChangeText={setReason} multiline maxLength={2000} editable={!disabled} placeholder="Explain the evidence and why this decision is appropriate." /><Text style={styles.help}>At least 15 characters; an owner override or manual inspection decision needs 30. The reason is retained in the audit.</Text></View> : null}
        {proposal ? <View style={styles.card}><Text style={styles.heading}>Review this decision</Text><Text selectable style={styles.help}>{[operationLabels[proposal.operation], `Target ${proposal.targetId}`, `Revision ${proposal.expectedRevision}`, proposal.reason].join('\n')}</Text>{'ownerOverride' in proposal && proposal.ownerOverride ? <Text style={styles.warning}>This is an explicit owner override for your own listing.</Text> : null}<Button title="Confirm reviewed decision" busy={busy} onPress={() => { void confirm() }} /><Button title="Cancel this decision" secondary disabled={busy} onPress={() => setProposal(null)} /></View> : null}
        {tab === 'listings' ? <>
          {selected ? <View style={styles.card}><Text style={styles.heading}>{selected.title}</Text><Text selectable style={styles.help}>{selected.address}</Text><Text style={styles.help}>{[
            `${memberStatus(selected.status)} · ${selected.source === 'approved_gallery' ? 'Approved gallery; no recorded GPS proof' : 'Recorded asset'}`,
            `Document: ${memberStatus(selected.document.status)}${selected.document.approvalMatches ? ' · exact file approved' : ''}`,
            `Media: ${selected.media.photoCount} photos${selected.media.hasVideo ? ` · video ${selected.media.status ?? 'pending'}` : ''}`,
            `Fee: ${selected.fee.waived ? 'Waived' : selected.fee.paid ? 'Paid' : 'Unpaid'} · Location: ${selected.source === 'approved_gallery' ? 'Manual address review' : selected.locationStatus ?? 'Not checked'}`,
          ].join('\n')}</Text>
            {listing.error ? <Text style={styles.warning}>{listing.error}</Text> : null}
            <Button title="Refresh selected listing" secondary busy={listing.refreshing} disabled={busy} onPress={() => { void listing.refresh(true).catch(() => undefined) }} />
            {has('listing:review') ? <><Button title="Open private authority document" secondary disabled={busy || !selected.document.present} onPress={() => { void previewDocument(selected) }} />
              {selected.lister.id === actorId && dashboard.data.role === 'owner' ? <><Text style={styles.warning}>Reviewing your own listing needs an explicit owner override and a detailed reason.</Text><Button title={ownerOverride ? 'Owner override enabled — disable' : 'Enable owner override for my listing'} secondary disabled={disabled} onPress={() => setOwnerOverride(value => !value)} /></> : null}
              {(['approve_document', 'reject_document', 'publish', 'suspend_listing'] as const).map(operation => <Button key={operation} title={operationLabels[operation]} secondary disabled={disabled || Boolean(dashboard.error) || (selected.lister.id === actorId && !ownerOverride)} onPress={() => propose(operation, selected.id, selected.revision, { ownerOverride })} />)}
            </> : null}
            {has('listing:waive') ? <Button title={selected.fee.waived ? 'Revoke fee waiver' : 'Waive listing fee'} secondary disabled={disabled || Boolean(dashboard.error) || (selected.lister.id === actorId && !ownerOverride)} onPress={() => propose(selected.fee.waived ? 'revoke_fee_waiver' : 'waive_fee', selected.id, selected.revision, { ownerOverride })} /> : null}
          </View> : <Text style={styles.help}>Select a listing to inspect its current document, media, fee and publication status.</Text>}
          {dashboard.data.listings.length ? dashboard.data.listings.map(item => <View key={item.id} style={styles.card}><Text style={styles.heading}>{item.title}</Text><Text style={styles.help}>{memberStatus(item.status)} · {item.source === 'approved_gallery' ? 'Gallery review' : 'Recorded asset'}</Text><Button title={`Review ${item.title}`} secondary disabled={disabled} onPress={() => { setSelectedId(item.id); setOwnerOverride(false) }} /></View>) : <StatusView title="No listings in this queue" message="Listings awaiting review will appear here." />}
        </> : tab === 'people' ? <>
          {has('user:manage') || has('gallery:manage') || has('staff:manage') ? <><Field label="Find member by email or username" value={query} onChangeText={setQuery} maxLength={254} editable={!disabled} autoCapitalize="none" /><Button title="Search members" secondary disabled={disabled} onPress={() => setSearch(query.trim())} />
            {dashboard.data.role === 'owner' ? <><Text style={styles.help}>Changing your own gallery permission requires an explicit owner override and a detailed reason.</Text><Button title={ownerOverride ? 'Owner-self override enabled — disable' : 'Enable owner-self gallery override'} secondary disabled={disabled} onPress={() => setOwnerOverride(value => !value)} /></> : null}
            {has('staff:manage') ? <><Text style={styles.help}>New staff role</Text><Host matchContents colorScheme="dark" seedColor={colors.accentBright}><Picker selectedValue={role} onValueChange={value => setRole(String(value))} enabled={!disabled} testID="admin-staff-role">{['member', 'moderator', 'finance', 'analyst', 'admin'].map(value => <Picker.Item key={value} value={value} label={value} />)}</Picker></Host></> : null}
            {people.loading && search !== null ? <StatusView loading message="Finding members…" /> : people.error ? <StatusView title="Member search unavailable" message={people.error} onRetry={() => { void people.refresh(true).catch(() => undefined) }} /> : (search === null ? dashboard.data.users : people.data?.items ?? []).length ? (search === null ? dashboard.data.users : people.data?.items ?? []).map(userCard) : <StatusView title="No matching members" message="Try the member's full email or username." />}
          </> : <Text style={styles.help}>Your role does not manage member permissions.</Text>}
        </> : tab === 'inspections' ? <>
          <Text style={styles.help}>Gallery inspection review records a human decision. It does not create GPS evidence or automatically release funds.</Text>
          {dashboard.data.inspections.length ? dashboard.data.inspections.map(item => <View key={item.id} style={styles.card}><Text style={styles.heading}>Inspection · {memberStatus(item.status)}</Text><Text selectable style={styles.help}>{[`Booking ${item.id}`, new Date(item.startsAt).toLocaleString(), item.evidence].join('\n')}</Text>{has('inspection:review') && item.status === 'pending' ? <>{(['approve', 'reject'] as const).map(decision => <Button key={decision} title={decision === 'approve' ? 'Approve inspection evidence' : 'Reject inspection evidence'} secondary disabled={disabled || [item.hostId, item.renterId].includes(actorId)} onPress={() => propose('review_manual_inspection', item.id, item.revision, { decision })} />)}</> : null}</View>) : <StatusView title="No manual inspections" message="Submitted gallery-inspection evidence will appear here." />}
        </> : <>
          <Button title="Refresh audit history" secondary busy={busy} onPress={() => { void reviewHistory() }} />
          {dashboard.data.audit.length ? dashboard.data.audit.map(item => <View key={item.id} style={styles.card}><Text style={styles.heading}>{item.action.replace(/_/g, ' ')}</Text><Text selectable style={styles.help}>{[`${item.targetType} · ${item.targetId}`, new Date(item.createdAt).toLocaleString(), item.reason].join('\n')}</Text></View>) : <StatusView title="No decisions recorded" message="Administrative decisions will be recorded here." />}
        </>}
        <View style={styles.card}><Text style={styles.heading}>Specialist web workspaces</Text><Text style={styles.help}>These open the existing website. Sign in there separately. Financial approvals retain their independent review rules.</Text>
          {([['finance:review', 'Finance and settlement', '/marketplace/admin/finance'], ['operations:read', 'Disputes and safety', '/marketplace/admin'], ['renewal:review', 'Lease lifecycle', '/marketplace/admin/lifecycle'], ['ad:review', 'Campaign review', '/marketplace/admin/campaigns'], ['operations:read', 'Matching moderation', '/marketplace/admin/matching'], ['insights:view', 'Insights', '/marketplace/insights']] as const).filter(([permission]) => has(permission)).map(([, title, path]) => <Button key={path} title={title} secondary disabled={busy} onPress={() => { void openWeb(path) }} />)}
          {dashboard.data.role === 'owner' ? <Button title="Owner controls on the web" secondary disabled={busy} onPress={() => { void openWeb('/admin') }} /> : null}
        </View>
      </>}
      {message ? <Text selectable accessibilityLiveRegion="polite" style={styles.warning}>{message}</Text> : null}
    </Page>
  </KeyboardAvoidingView>
}
const styles = StyleSheet.create({ keyboard: { flex: 1, backgroundColor: colors.background }, card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.xl, padding: space.xl, gap: space.lg }, heading: { color: colors.text, fontFamily: fonts.semibold, fontSize: 18 }, help: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 22 }, warning: { color: colors.warning, fontFamily: fonts.medium, fontSize: 13, lineHeight: 22 } })
