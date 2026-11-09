import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useMemberPages } from '../hooks/use-member-resource'
import { discoveryPageSchema } from '../lib/discovery-input'
import type { Listing } from '../lib/types'
import { Button } from './Button'
import { Field } from './Field'
import { StatusView } from './StatusView'
import { colors, fonts, space } from '../theme'

export function ListingSharePicker({ onSelect, onClose }: { onSelect: (listing: Listing) => void; onClose: () => void }) {
  const [query, setQuery] = useState(''), [applied, setApplied] = useState('')
  const listings = useMemberPages(`/listings${applied ? `?q=${encodeURIComponent(applied)}` : ''}`, discoveryPageSchema)
  return <View style={styles.section}>
    <Text style={styles.heading}>Share an active listing</Text>
    <Field label="Find a listing to share" value={query} onChangeText={setQuery} maxLength={100} />
    <Button title="Search listings to share" secondary onPress={() => setApplied(query.trim())} />
    {listings.loading ? <StatusView loading message="Finding active listings…" /> : listings.error && !listings.data ? <StatusView title="Listings unavailable" message={listings.error} onRetry={() => { void listings.refresh().catch(() => undefined) }} /> : listings.items.length ? listings.items.map(item => <View key={item.id} style={styles.section}><Text style={styles.body}>{item.title} · {item.location}</Text><Button title={`Share ${item.title}`} secondary onPress={() => onSelect(item)} /></View>) : <Text style={styles.help}>No active listings match this search.</Text>}
    {listings.hasMore ? <Button title="More listings to share" secondary busy={listings.loadingMore} onPress={() => { void listings.loadMore() }} /> : null}
    {listings.moreError ? <Text style={styles.warning}>{listings.moreError}</Text> : null}
    <Button title="Close listing picker" secondary onPress={onClose} />
  </View>
}
const styles = StyleSheet.create({ section: { gap: space.md }, heading: { color: colors.text, fontFamily: fonts.semibold, fontSize: 16 }, body: { color: colors.secondary, fontFamily: fonts.regular, fontSize: 13, lineHeight: 21 }, help: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 20 }, warning: { color: colors.warning, fontFamily: fonts.medium, fontSize: 12 } })
