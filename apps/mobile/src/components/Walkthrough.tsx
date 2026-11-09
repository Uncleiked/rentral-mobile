import { useCallback, useEffect, useState } from 'react'
import { AppState, StyleSheet, Text, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { useVideoPlayer, VideoView } from 'expo-video'
import { colors, fonts, radius, space } from '../theme'

type Props = { uri: string }
export function Walkthrough({ uri }: Props) {
  const [error, setError] = useState(false)
  const player = useVideoPlayer({ uri, contentType: uri.includes('.m3u8') ? 'hls' : 'auto' }, video => { video.loop = true })
  useFocusEffect(useCallback(() => () => { player.pause() }, [player]))
  useEffect(() => {
    const listener = player.addListener('statusChange', ({ status }) => setError(status === 'error'))
    const appListener = AppState.addEventListener('change', state => { if (state !== 'active') player.pause() })
    return () => { listener.remove(); appListener.remove() }
  }, [player])
  return <View style={styles.frame}><VideoView player={player} style={styles.video} nativeControls fullscreenOptions={{ enable: true }} contentFit="contain" />
    {error ? <Text accessibilityRole="alert" style={styles.error}>This walkthrough could not be played. Pull down to refresh its access link.</Text> : null}</View>
}
const styles = StyleSheet.create({
  frame: { borderRadius: radius.xl, overflow: 'hidden', borderColor: colors.border, borderWidth: 1, backgroundColor: colors.surface },
  video: { width: '100%', aspectRatio: 9 / 12 }, error: { color: colors.warning, fontFamily: fonts.regular, fontSize: 12, lineHeight: 20, padding: space.lg },
})
