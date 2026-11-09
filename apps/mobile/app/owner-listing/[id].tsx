import { useRef, useState } from 'react'
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native'
import { Stack, router, useLocalSearchParams } from 'expo-router'
import { ownerListingDetailSchema } from '../../../../lib/contracts/listings'
import { Page } from '../../src/components/Page'
import { Button } from '../../src/components/Button'
import { StatusView } from '../../src/components/StatusView'
import { OwnerListingEditor } from '../../src/components/owner-listing-editor'
import { OwnerListingMedia } from '../../src/components/owner-listing-media'
import { ListingPublicationFee } from '../../src/components/listing-publication-fee'
import { useMemberResource } from '../../src/hooks/use-member-resource'
import { useAuth } from '../../src/providers/AuthProvider'
import { archiveOwnerListing, ownerDocumentLink } from '../../src/lib/owner-listing-api'
import { previewPrivateDocument } from '../../src/lib/private-document'
import { errorMessage } from '../../src/lib/api'
import { memberStatus } from '../../src/lib/member-format'
import { colors, fonts, radius, space } from '../../src/theme'

export default function OwnerListingScreen() {
  const params = useLocalSearchParams<{ id: string }>()
  const id = typeof params.id === 'string' ? params.id : ''
  const valid = /^[0-9a-f-]{36}$/i.test(id)
  const resource = useMemberResource(`/my-listings/${id}`, ownerListingDetailSchema, valid)
  const listing = resource.data
  const { session } = useAuth()
  const [busy, setBusy] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const pending = useRef(false)
  async function archive(): Promise<void> {
    if (pending.current || uncertain || !listing || !session) return
    pending.current = true; setBusy(true); setMessage(null)
    try { const updated = await archiveOwnerListing(id, !listing.archivedAt, session.user.id); resource.replace(updated); setMessage(updated.archivedAt ? 'Your listing is archived. Its evidence, bookings and payment history are retained.' : 'Your listing is restored. Submitted listings return to review before becoming public.') }
    catch (failure) { setUncertain(true); setMessage(errorMessage(failure)) }
    finally { pending.current = false; setBusy(false) }
  }
  async function check(): Promise<void> {
    if (pending.current) return
    pending.current = true; setBusy(true)
    try { await resource.refresh(true); setUncertain(false); setMessage('Your latest listing status is shown. No archive change was automatically repeated.') }
    catch (failure) { setMessage(errorMessage(failure)) }
    finally { pending.current = false; setBusy(false) }
  }
  async function document(): Promise<void> {
    if (pending.current || !session) return
    pending.current = true; setBusy(true); setMessage(null)
    try { const link = await ownerDocumentLink(id); await previewPrivateDocument(link.url, session.user.id) }
    catch (failure) { setMessage(errorMessage(failure)) }
    finally { pending.current = false; setBusy(false) }
  }
  return <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <Stack.Screen options={{ title: 'Manage listing', headerShown: true }} />
    <Page title={typeof listing?.metadata.listingTitle === 'string' && listing.metadata.listingTitle ? listing.metadata.listingTitle : 'Manage your listing'} subtitle="Owner-only details, private evidence and listing controls." refreshing={resource.refreshing} onRefresh={valid ? () => { void resource.refresh(true).catch(() => undefined) } : undefined}>
      {!valid ? <StatusView title="Listing unavailable" message="This owner listing link is invalid." /> : resource.loading ? <StatusView loading message="Loading your listing…" /> : !listing ? <StatusView title="Listing unavailable" message={resource.error ?? 'This listing is unavailable to your account.'} onRetry={() => { void resource.refresh(true).catch(() => undefined) }} /> : <>
        <View style={styles.card}><Text style={styles.heading}>{listing.archivedAt ? 'Archived' : memberStatus(listing.status)} · {memberStatus(listing.category)}</Text><Text selectable style={styles.body}>{listing.address || 'Address not added yet.'}</Text><Text style={styles.help}>{listing.hasCoords ? 'Capture location is stored privately on the server.' : 'A capture location is needed before submission.'} Exact coordinates are never returned when reopening a listing.</Text>
          {listing.documentPath ? <Button title="View private authority document" secondary busy={busy} onPress={() => { void document() }} /> : <Text style={styles.help}>No authority document is saved.</Text>}
          {listing.actions.resume ? <Button title="Resume this draft" onPress={() => router.push({ pathname: '/create-listing', params: { draft: id } })} /> : null}
          {!listing.archivedAt && listing.status === 'active' ? <Button title="View public listing" secondary onPress={() => router.push({ pathname: '/listing/[id]', params: { id } })} /> : null}
        </View>
        {listing.status !== 'draft' ? <ListingPublicationFee key={`${session?.user.id}:${id}`} listingId={id} /> : null}
        {listing.videoPath ? <OwnerListingMedia id={id} /> : null}
        {listing.actions.edit ? <OwnerListingEditor key={id} listing={listing} onUpdated={resource.replace} refresh={() => resource.refresh(true)} /> : null}
        <View style={styles.card}><Text style={styles.heading}>{listing.archivedAt ? 'Restore listing' : 'Archive listing'}</Text><Text style={styles.help}>Archiving removes a listing from discovery while retaining its private evidence and history. Outstanding requests, bookings, holds and reports must be resolved first. Restored submitted listings require review again.</Text>
          {uncertain ? <Button title="Check listing archive status" secondary busy={busy} onPress={() => { void check() }} /> : listing.actions.archive || listing.actions.restore ? <Button title={listing.archivedAt ? 'Restore listing for review' : 'Archive this listing'} secondary busy={busy} onPress={() => { void archive() }} /> : null}
        </View>
        {resource.error ? <Text accessibilityRole="alert" style={styles.warning}>Could not refresh: {resource.error}</Text> : null}
      </>}
      {message ? <Text selectable accessibilityLiveRegion="polite" style={styles.warning}>{message}</Text> : null}
    </Page>
  </KeyboardAvoidingView>
}
const styles = StyleSheet.create({ keyboard: { flex: 1, backgroundColor: colors.background }, card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, padding: space.xl, gap: space.lg }, heading: { color: colors.text, fontFamily: fonts.semibold, fontSize: 20 }, body: { color: colors.secondary, fontFamily: fonts.regular, fontSize: 14, lineHeight: 23 }, help: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 21 }, warning: { color: colors.warning, fontFamily: fonts.medium, fontSize: 13, lineHeight: 22 } })
