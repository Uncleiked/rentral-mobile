import { useState } from 'react'
import { Image, StyleSheet, Text, View } from 'react-native'
import { nativePhotoAspectRatio } from '../lib/photo-layout'
import { colors, fonts, radius, space } from '../theme'

type Props = { uri: string; alt: string; onError?: () => void }
function Photo({ uri, alt, onError }: Props) {
  const [aspectRatio, setAspectRatio] = useState(4 / 3), [failed, setFailed] = useState(false)
  if (failed) return <View style={[styles.photo, styles.failure]} accessibilityRole="image" accessibilityLabel={alt + ': image unavailable'}><Text style={styles.help}>Photo unavailable. Refresh the listing media to try again.</Text></View>
  return <Image source={{ uri }} alt={alt} accessibilityLabel={alt} style={[styles.photo, { aspectRatio }]} resizeMode="contain"
    onLoad={({ nativeEvent }) => setAspectRatio(nativePhotoAspectRatio(nativeEvent.source.width, nativeEvent.source.height))}
    onError={() => { setFailed(true); onError?.() }} />
}
/** A new signed source resets layout/failure state; originals remain unchanged. */
export function ListingPhoto(props: Props) { return <Photo key={props.uri} {...props} /> }
const styles = StyleSheet.create({ photo: { width: '100%', borderRadius: radius.lg, backgroundColor: colors.surface }, failure: { aspectRatio: 4 / 3, alignItems: 'center', justifyContent: 'center', padding: space.lg }, help: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 20, textAlign: 'center' } })
