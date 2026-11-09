import { Pressable, StyleSheet, Text, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { router } from 'expo-router'
import type { Conversation } from '../lib/types'
import { memberDate } from '../lib/member-format'
import { colors, fonts, radius, space } from '../theme'

type Props = { conversation: Conversation }

export function ConversationCard({ conversation }: Props) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${conversation.unread ? 'Unread conversation' : 'Conversation'} with ${conversation.otherName}`} onPress={() => router.push({ pathname: '/conversation/[id]', params: { id: conversation.id } })}
    style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
    <View style={styles.avatar}><Text style={styles.initial}>{conversation.otherName.charAt(0).toUpperCase()}</Text></View>
    <View style={styles.body}><View style={styles.top}><Text style={styles.name} numberOfLines={1}>{conversation.otherName}</Text><Text style={styles.date}>{memberDate(conversation.updatedAt)}</Text></View>
      <Text style={styles.preview} numberOfLines={2}>{conversation.lastMessage ?? 'Say hello and ask about the listing.'}</Text></View>
    {conversation.unread ? <Text style={styles.unread}>Unread</Text> : <Ionicons name="chevron-forward" color={colors.muted} size={16} />}
  </Pressable>
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, pressed: { opacity: 0.75 },
  avatar: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentMuted }, initial: { color: colors.accentBright, fontFamily: fonts.semibold, fontSize: 18 },
  body: { flex: 1, gap: space.sm }, top: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.sm }, name: { flex: 1, minWidth: 80, color: colors.text, fontFamily: fonts.semibold, fontSize: 14 },
  date: { color: colors.muted, fontFamily: fonts.regular, fontSize: 10 }, preview: { color: colors.secondary, fontFamily: fonts.regular, fontSize: 12, lineHeight: 19 },
  unread: { color: colors.accentBright, fontFamily: fonts.semibold, fontSize: 11 },
})
