import { StyleSheet, Text, View } from 'react-native'
import { Button } from './Button'
import { Walkthrough } from './Walkthrough'
import { StatusView } from './StatusView'
import { useMemberResource } from '../hooks/use-member-resource'
import { nativeMediaUrl } from '../lib/media-url'
import { config } from '../lib/config'
import { colors, fonts, space } from '../theme'
import { nativeListingMediaSchema } from '../lib/listing-media'
import { GalleryPhotos } from './gallery-photos'

export function OwnerListingMedia({ id }: { id: string }) {
  const resource = useMemberResource(`/listings/${id}/media`, nativeListingMediaSchema, true, 240000)
  const uri = nativeMediaUrl(resource.data?.videoUrl ?? null, config.apiUrl)
  return <View style={styles.container}>
    {resource.data?.galleryPhotoUrls?.length ? <GalleryPhotos urls={resource.data.galleryPhotoUrls} /> : null}
    {uri ? <Walkthrough key={uri} uri={uri} /> : resource.data?.galleryPhotoUrls?.length ? <Text style={styles.help}>Gallery photos are available.{resource.data.mediaSource === 'approved_gallery' ? ' An optional video may still need processing.' : ''}</Text> : <StatusView loading={resource.loading} title={resource.error ? 'Media unavailable' : 'No media saved'} message={resource.error ?? 'Saved listing media will appear here.'} />}
    {resource.error && resource.data ? <Text accessibilityRole="alert" style={styles.help}>Could not refresh walkthrough access: {resource.error}</Text> : null}
    <Button title="Refresh listing media access" secondary busy={resource.refreshing} onPress={() => { void resource.refresh(true).catch(() => undefined) }} />
  </View>
}
const styles = StyleSheet.create({ container: { gap: space.lg }, help: { color: colors.warning, fontFamily: fonts.regular, fontSize: 12, lineHeight: 21 } })
