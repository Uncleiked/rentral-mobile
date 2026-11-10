import { useState } from 'react'
import { Image, StyleSheet, Text, View } from 'react-native'
import { nativeGalleryPhotoUrl } from '../lib/listing-media'
import { config } from '../lib/config'
import { colors, fonts, radius, space } from '../theme'
export function GalleryPhotos({ urls }: { urls: string[] }) {
  const [failed, setFailed] = useState<string[]>([])
  const photos = urls.slice(0, 10).map(value => nativeGalleryPhotoUrl(value, config.apiUrl)).filter((value): value is string => Boolean(value))
  if (!photos.length) return null
  return <View style={styles.gallery}><Text style={styles.label}>Gallery photos · no recorded GPS proof</Text>{photos.map((uri, index) => failed.includes(uri) ? <Text key={uri} style={styles.label}>Photo {index + 1} could not load. Refresh the listing media and try again.</Text> : <Image key={uri} source={{ uri }} alt={`Listing gallery photo ${index + 1}`} accessibilityLabel={`Listing gallery photo ${index + 1} of ${photos.length}`} style={styles.photo} resizeMode="contain" onError={() => setFailed(previous => [...new Set([...previous.filter(value => photos.includes(value)), uri])])} />)}</View>
}
const styles = StyleSheet.create({ gallery: { gap: space.md }, label: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 20 }, photo: { width: '100%', aspectRatio: 4 / 3, borderRadius: radius.lg, backgroundColor: colors.surface } })
