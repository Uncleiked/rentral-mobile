import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Stack, router } from 'expo-router'
import { matchConnectionPageSchema } from '../../../lib/matching/contracts'
import { Button } from '../src/components/Button'
import { StatusView } from '../src/components/StatusView'
import { MemberAvatar } from '../src/components/member-avatar'
import { useMemberPages } from '../src/hooks/use-member-resource'
import { useAuth } from '../src/providers/AuthProvider'
import { useMatchingPrivacy } from '../src/hooks/use-matching-privacy'
import { colors, fonts, radius, space } from '../src/theme'

function Connections() {
  const contacts = useMemberPages('/squat-mates/connections', matchConnectionPageSchema)
  const refresh = () => { void contacts.refresh(true).catch(() => undefined) }
  return <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}><Stack.Screen options={{ title: 'Matching contacts' }} /><FlatList data={contacts.items} keyExtractor={item => item.id} contentContainerStyle={styles.content} refreshing={contacts.refreshing} onRefresh={refresh}
    ListHeaderComponent={<View style={styles.section}><Text style={styles.title}>Choose your connections.</Text><Text style={styles.help}>A request needs the invited member’s acceptance. Messages open only while both matching profiles and the contact remain available.</Text>{contacts.error && contacts.data ? <Text style={styles.warning}>Could not refresh: {contacts.error}</Text> : null}<Button title="Refresh matching contacts" secondary onPress={refresh} /></View>}
    ListEmptyComponent={contacts.loading ? <StatusView loading message="Opening matching contacts…" /> : contacts.error ? <StatusView title="Contacts unavailable" message={contacts.error} onRetry={refresh} /> : <StatusView title="No active matching contacts" message="Send a contact request from Squat-Mates, or wait for an invitation. Hidden, blocked and closed contacts do not appear here." />}
    renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`Open matching contact ${item.other.username ?? 'Rentral member'}`} onPress={() => router.push({ pathname: '/match/[id]', params: { id: item.id } })} style={styles.card}><View style={styles.row}><MemberAvatar url={item.other.avatarUrl} name={item.other.username ?? 'Rentral member'} size="small" /><Text style={styles.heading}>{item.other.username ? `@${item.other.username}` : 'Rentral member'}</Text>{item.unread ? <Text style={styles.unread}>Unread</Text> : null}</View><Text style={styles.help}>{item.status === 'requested' ? item.requestedByMe ? 'You requested contact' : 'Invitation awaiting your decision' : 'Contact accepted'}</Text>{item.lastMessage ? <Text style={styles.body} numberOfLines={2}>{item.lastMessage.own ? 'You: ' : ''}{item.lastMessage.body}</Text> : null}</Pressable>}
    ListFooterComponent={<View style={styles.section}>{contacts.moreError ? <Text style={styles.warning}>{contacts.moreError}</Text> : null}{contacts.hasMore ? <Button title="Older matching contacts" secondary busy={contacts.loadingMore} onPress={() => { void contacts.loadMore() }} /> : null}<Button title="Browse shared-home preferences" secondary onPress={() => router.push('/squat-mates')} /></View>} /></SafeAreaView>
}
export default function MatchingConnectionsScreen() {
  const { session } = useAuth()
  const epoch = useMatchingPrivacy(session?.user.id ?? '')
  return <Connections key={`${session?.user.id ?? ''}:${epoch}`} />
}
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.background }, content: { padding: space.xl, gap: space.lg, paddingBottom: space.xxl }, section: { gap: space.lg }, card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.xl, padding: space.xl, gap: space.md }, row: { flexDirection: 'row', alignItems: 'center', gap: space.md }, title: { color: colors.text, fontFamily: fonts.semibold, fontSize: 28, lineHeight: 36 }, heading: { flex: 1, color: colors.text, fontFamily: fonts.semibold, fontSize: 17 }, unread: { color: colors.accentBright, fontFamily: fonts.semibold, fontSize: 11 }, body: { color: colors.secondary, fontFamily: fonts.regular, fontSize: 13, lineHeight: 21 }, help: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 21 }, warning: { color: colors.warning, fontFamily: fonts.medium, fontSize: 13 } })
