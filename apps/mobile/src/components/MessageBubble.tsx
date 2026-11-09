import { Pressable, StyleSheet, Text, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { router } from 'expo-router'
import type { Message } from '../lib/types'
import { memberDate, memberTime } from '../lib/member-format'
import { colors, fonts, radius, space } from '../theme'

type Props = { message: Message; own: boolean; read: boolean }

export function MessageBubble({ message, own, read }: Props) {
  const sharedListing = message.sharedListing
  return <View style={[styles.row, own && styles.ownRow]}><View style={[styles.bubble, own && styles.ownBubble]}>
    {message.body ? <Text selectable style={styles.body}>{message.body}</Text> : null}
    {sharedListing ? <Pressable accessibilityRole="button" accessibilityLabel="Open shared listing" style={styles.shared}
      onPress={() => router.push({ pathname: '/listing/[id]', params: { id: sharedListing.id } })}>
      <Ionicons name="open-outline" size={16} color={colors.accentBright} /><Text style={styles.sharedText}>View shared {sharedListing.category === 'house' ? 'home' : sharedListing.category}</Text>
    </Pressable> : null}
    <Text style={styles.time}>{memberDate(message.sentAt)} · {memberTime(message.sentAt)}{own && read ? ' · Read' : ''}</Text>
  </View></View>
}

const styles = StyleSheet.create({
  row: { alignItems: 'flex-start', marginVertical: space.xs }, ownRow: { alignItems: 'flex-end' },
  bubble: { maxWidth: '88%', padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: space.sm }, ownBubble: { backgroundColor: colors.accentMuted },
  body: { color: colors.text, fontFamily: fonts.regular, fontSize: 14, lineHeight: 22 }, time: { color: colors.muted, fontFamily: fonts.regular, fontSize: 10, lineHeight: 16 },
  shared: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44 }, sharedText: { color: colors.accentBright, fontFamily: fonts.medium, fontSize: 12, flexShrink: 1 },
})
