import { useLayoutEffect, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import type { OwnerListingDetail } from '../../../../lib/contracts/listings'
import { NativeListingFields } from './NativeListingFields'
import { Button } from './Button'
import { formFromOwnerListing, listingFormError, nativeListingMetadata, type ListingForm } from '../lib/native-listing'
import { editOwnerListing } from '../lib/owner-listing-api'
import { errorMessage } from '../lib/api'
import { bookingOutcomeUncertain } from '../lib/booking-api'
import { useAuth } from '../providers/AuthProvider'
import { colors, fonts, radius, space } from '../theme'
import { CaptureAddressCheck } from './capture-address-check'
import { captureAddressKey, checkNativeCaptureAddress } from '../lib/capture-api'
import type { NativeAddressCheck } from '../lib/native-draft-workflow'

type Props = { listing: OwnerListingDetail; onUpdated: (listing: OwnerListingDetail) => void; refresh: () => Promise<OwnerListingDetail> }
export function OwnerListingEditor({ listing, onUpdated, refresh }: Props) {
  const { session } = useAuth()
  const [draft, setDraft] = useState({ base: listing, form: formFromOwnerListing(listing) })
  const dirty = JSON.stringify(draft.form) !== JSON.stringify(formFromOwnerListing(draft.base))
  const form = dirty ? draft.form : formFromOwnerListing(listing)
  const base = dirty ? draft.base : listing
  const [busy, setBusy] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [addressCheck, setAddressCheck] = useState<NativeAddressCheck | null>(null)
  const pending = useRef(false)
  const actor = useRef(session?.user.id)
  useLayoutEffect(() => { actor.current = session?.user.id; return () => { actor.current = undefined } }, [session?.user.id])
  const addressChanged = captureAddressKey(base.address) !== captureAddressKey(form.address)
  const usesGallery = base.mediaSource === 'approved_gallery'
  const addressMatched = addressCheck?.status === 'matched' && addressCheck.captureId === base.captureId && addressCheck.addressKey === captureAddressKey(form.address)
  function change(next: ListingForm): void { if (captureAddressKey(next.address) !== captureAddressKey(form.address)) setAddressCheck(null); setDraft({ base, form: next }); setMessage(null) }
  async function checkAddress(): Promise<void> {
    if (pending.current || !session || !base.captureId) return
    const actorId = session.user.id, id = base.captureId, address = form.address
    pending.current = true; setBusy(true); setMessage(null); setAddressCheck(null)
    try {
      const result = await checkNativeCaptureAddress(id, address, actorId)
      if (actor.current !== actorId) return
      setAddressCheck({ captureId: id, addressKey: captureAddressKey(address), status: result.status, reason: result.reason })
    } catch (failure) { if (actor.current === actorId) setMessage(errorMessage(failure)) }
    finally { pending.current = false; setBusy(false) }
  }
  async function save(): Promise<void> {
    if (pending.current || uncertain || !session) return
    const invalid = listingFormError(listing.category, form)
    if (invalid) { setMessage(invalid); return }
    if (!usesGallery && addressChanged && !addressMatched) { setMessage('Check that the changed address matches the locked recording location before saving.'); return }
    pending.current = true; setBusy(true); setMessage(null)
    try {
      const updated = await editOwnerListing(listing.id, { listingId: listing.id, expectedRevision: base.revision, address: form.address.trim(), basePrice: form.basePrice, metadata: nativeListingMetadata(listing.category, form) }, session.user.id)
      onUpdated(updated); setDraft({ base: updated, form: formFromOwnerListing(updated) }); setMessage('Your listing details are saved. Any changed address returns to review.')
    } catch (failure) { setMessage(errorMessage(failure)); if (bookingOutcomeUncertain(failure)) setUncertain(true) }
    finally { pending.current = false; setBusy(false) }
  }
  async function check(): Promise<void> {
    if (pending.current) return
    pending.current = true; setBusy(true)
    try { await refresh(); setUncertain(false); setMessage('The latest server revision is loaded. Your unsaved edits are kept for comparison. Reload the latest details if another version was saved.') }
    catch (failure) { setMessage(errorMessage(failure)) }
    finally { pending.current = false; setBusy(false) }
  }
  return <View style={styles.card}>
    <Text style={styles.heading}>Edit listing details</Text><Text style={styles.help}>{usesGallery ? 'Gallery media and authority documents are sealed after submission. Your address receives human review and has no recorded GPS proof.' : 'Category, recorded walkthrough, captured location and authority documents are sealed after submission.'} An address change needs fresh review and is blocked after a confirmed booking.</Text>
    {base.revision !== listing.revision && dirty ? <Text style={styles.warning}>The server has revision {listing.revision}; your edits began at revision {base.revision}. Your edits are kept, and a stale save will be declined.</Text> : null}
    <NativeListingFields category={listing.category} value={form} onChange={change} disabled={busy || uncertain} />
    {addressChanged && !usesGallery ? <CaptureAddressCheck status={addressMatched ? 'matched' : addressCheck?.addressKey === captureAddressKey(form.address) && addressCheck.captureId === base.captureId ? addressCheck.status : null} reason={addressCheck?.reason} canCheck={Boolean(base.captureId) && form.address.trim().length >= 5} disabled={busy || uncertain} onCheck={() => { void checkAddress() }} /> : null}
    {uncertain ? <Button title="Check saved listing details" secondary busy={busy} onPress={() => { void check() }} /> : <Button title="Save listing details" busy={busy} disabled={!dirty || (!usesGallery && addressChanged && !addressMatched)} onPress={() => { void save() }} />}
    <Text style={styles.help}>Reloading below replaces unsaved edits with the current server details.</Text><Button title="Use latest server details" secondary disabled={busy || uncertain} onPress={() => { setDraft({ base: listing, form: formFromOwnerListing(listing) }); setAddressCheck(null); setMessage(null) }} />
    {message ? <Text selectable accessibilityLiveRegion="polite" style={styles.warning}>{message}</Text> : null}
  </View>
}
const styles = StyleSheet.create({ card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, padding: space.xl, gap: space.lg }, heading: { color: colors.text, fontFamily: fonts.semibold, fontSize: 20 }, help: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 21 }, warning: { color: colors.warning, fontFamily: fonts.medium, fontSize: 13, lineHeight: 22 } })
