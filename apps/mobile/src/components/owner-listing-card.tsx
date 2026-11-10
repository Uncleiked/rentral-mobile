import { StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import type { OwnerListingSummary } from '../../../../lib/contracts/listings'
import { Button } from './Button'
import { memberDate, memberStatus } from '../lib/member-format'
import { colors, fonts, radius, space } from '../theme'

export function OwnerListingCard({ listing }: { listing: OwnerListingSummary }) {
  return <View style={styles.card}>
    <Text style={styles.title}>{listing.title}</Text><Text style={styles.help}>{listing.archivedAt ? 'Archived' : memberStatus(listing.status)} · {memberStatus(listing.category)}</Text>
    {listing.price ? <Text selectable style={styles.amount}>₦{listing.price} <Text style={styles.help}>/ {listing.pricePeriod}</Text></Text> : <Text style={styles.help}>Price not added yet.</Text>}
    <Text style={styles.help}>Created {memberDate(listing.createdAt)} · {listing.mediaSource === 'approved_gallery' ? `${listing.galleryPhotos?.length ?? 0} gallery photos${listing.hasVideo ? ' and video' : ''}` : listing.hasVideo ? 'Walkthrough saved' : 'Walkthrough needed'} · {listing.hasDocument ? 'Private document saved' : 'Document needed'}</Text>
    {listing.status === 'pending_verification' ? <Text style={styles.help}>Open Manage listing to check the publication fee or waiver. Asset and media review remain separate; this status does not confirm either outcome.</Text> : null}
    {listing.status === 'draft' && !listing.archivedAt ? <Button title="Resume draft" onPress={() => router.push({ pathname: '/create-listing', params: { draft: listing.id } })} /> : null}
    <Button title={listing.archivedAt ? 'Manage archived listing' : 'Manage listing'} secondary onPress={() => router.push({ pathname: '/owner-listing/[id]', params: { id: listing.id } })} />
  </View>
}
const styles = StyleSheet.create({ card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, padding: space.xl, gap: space.lg }, title: { color: colors.text, fontFamily: fonts.semibold, fontSize: 19 }, amount: { color: colors.accentBright, fontFamily: fonts.bold, fontSize: 22, fontVariant: ['tabular-nums'] }, help: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 21 } })
