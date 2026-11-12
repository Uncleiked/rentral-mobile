import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { nativeGalleryPhotoUrl } from '../lib/listing-media'
import { config } from '../lib/config'
import { ListingPhoto } from './listing-photo'
import { colors, fonts, space } from '../theme'
export function GalleryPhotos({ urls }: { urls: string[] }) {
  const [failed, setFailed] = useState<string[]>([])
  const photos = urls.slice(0, 10).map(value => nativeGalleryPhotoUrl(value, config.apiUrl)).filter((value): value is string => Boolean(value))
  if (!photos.length) return null
  return <View style={styles.gallery}><Text style={styles.label}>Gallery photos · no recorded GPS proof</Text>{photos.map((uri, index) => failed.includes(uri) ? <Text key={uri} style={styles.label}>Photo {index + 1} could not load. Refresh the listing media and try again.</Text> : <ListingPhoto key={uri} uri={uri} alt={`Listing gallery photo ${index + 1} of ${photos.length}`} onError={() => setFailed(previous => [...new Set([...previous.filter(value => photos.includes(value)), uri])])} />)}</View>
}
const styles = StyleSheet.create({ gallery: { gap: space.md }, label: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 20 } })
