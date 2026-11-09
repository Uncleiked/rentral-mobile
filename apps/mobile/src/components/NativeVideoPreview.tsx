import { StyleSheet } from 'react-native'
import { useCallback } from 'react'
import { useFocusEffect } from 'expo-router'
import { useVideoPlayer, VideoView } from 'expo-video'
import { colors, radius } from '../theme'

export function NativeVideoPreview({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri)
  useFocusEffect(useCallback(() => () => { player.pause() }, [player]))
  return <VideoView player={player} style={styles.video} nativeControls contentFit="contain" />
}

const styles = StyleSheet.create({ video: { width: '100%', aspectRatio: 9 / 16, maxHeight: 480, backgroundColor: colors.background, borderRadius: radius.xl } })
