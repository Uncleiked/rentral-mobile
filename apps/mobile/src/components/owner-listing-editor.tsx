import { useRef, useState } from 'react'
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
  const pending = useRef(false)
  function change(next: ListingForm): void { setDraft({ base, form: next }); setMessage(null) }
  async function save(): Promise<void> {
    if (pending.current || uncertain || !session) return
    const invalid = listingFormError(listing.category, form)
    if (invalid) { setMessage(invalid); return }
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
    <Text style={styles.heading}>Edit listing details</Text><Text style={styles.help}>Category, recorded walkthrough, captured location and authority documents are sealed after submission. An address change needs fresh review and is blocked after a confirmed booking.</Text>
    {base.revision !== listing.revision && dirty ? <Text style={styles.warning}>The server has revision {listing.revision}; your edits began at revision {base.revision}. Your edits are kept, and a stale save will be declined.</Text> : null}
    <NativeListingFields category={listing.category} value={form} onChange={change} disabled={busy || uncertain} />
    {uncertain ? <Button title="Check saved listing details" secondary busy={busy} onPress={() => { void check() }} /> : <Button title="Save listing details" busy={busy} disabled={!dirty} onPress={() => { void save() }} />}
    <Text style={styles.help}>Reloading below replaces unsaved edits with the current server details.</Text><Button title="Use latest server details" secondary disabled={busy || uncertain} onPress={() => { setDraft({ base: listing, form: formFromOwnerListing(listing) }); setMessage(null) }} />
    {message ? <Text selectable accessibilityLiveRegion="polite" style={styles.warning}>{message}</Text> : null}
  </View>
}
const styles = StyleSheet.create({ card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, padding: space.xl, gap: space.lg }, heading: { color: colors.text, fontFamily: fonts.semibold, fontSize: 20 }, help: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 21 }, warning: { color: colors.warning, fontFamily: fonts.medium, fontSize: 13, lineHeight: 22 } })
