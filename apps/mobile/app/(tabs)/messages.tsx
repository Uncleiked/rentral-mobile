import { useCallback, useRef, useState } from 'react'
import { AppState, FlatList, StyleSheet, Text, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusView } from '../../src/components/StatusView'
import { Button } from '../../src/components/Button'
import { ConversationCard } from '../../src/components/ConversationCard'
import { useMemberPages } from '../../src/hooks/use-member-resource'
import { inboxSchema } from '../../src/lib/messaging-api'
import { colors, fonts, space } from '../../src/theme'

export default function MessagesScreen() {
  const inbox = useMemberPages('/messages', inboxSchema)
  const [archive, setArchive] = useState(false)
  const expanded = useRef(false)
  const refresh = inbox.refresh
  useFocusEffect(useCallback(() => {
    expanded.current = false; setArchive(false)
    const timer = setInterval(() => { if (!expanded.current && AppState.currentState === 'active') void refresh().catch(() => undefined) }, 5000)
    return () => clearInterval(timer)
  }, [refresh]))
  const reload = () => { expanded.current = false; setArchive(false); void refresh(true).catch(() => undefined) }
  return <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
    <FlatList data={inbox.items} keyExtractor={item => item.id} contentContainerStyle={styles.content} refreshing={inbox.refreshing} onRefresh={reload}
      ListHeaderComponent={<View style={styles.section}><Text style={styles.eyebrow}>Messages</Text><Text style={styles.title}>Keep the conversation going.</Text><Text style={styles.help}>Unread messages are marked below. Activity refreshes while your inbox is open.</Text>{inbox.error && inbox.data ? <Text accessibilityRole="alert" style={styles.error}>Could not refresh: {inbox.error}</Text> : null}{archive ? <><Text style={styles.help}>Viewing older conversations. Refresh to check for new messages.</Text><Button title="Check latest conversations" secondary onPress={reload} /></> : null}</View>}
      ListEmptyComponent={inbox.loading ? <StatusView loading message="Opening your inbox…" /> : inbox.error ? <StatusView title="Inbox unavailable" message={inbox.error} onRetry={reload} /> : <><StatusView title="Your conversations start here" message="Open a listing and tap Message host to ask a question or make a plan." /><Button title="Find a listing" onPress={() => router.navigate('/(tabs)/explore')} /></>}
      renderItem={({ item }) => <ConversationCard conversation={item} />}
      ListFooterComponent={<View style={styles.section}>{inbox.moreError ? <Text style={styles.error}>{inbox.moreError}</Text> : null}{inbox.hasMore ? <Button title="Older conversations" secondary busy={inbox.loadingMore} onPress={() => { expanded.current = true; setArchive(true); void inbox.loadMore() }} /> : null}</View>} />
  </SafeAreaView>
}
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.background }, content: { padding: space.xl, gap: space.lg, paddingBottom: space.xxl }, section: { gap: space.lg }, eyebrow: { color: colors.accentBright, fontFamily: fonts.medium, fontSize: 12 }, title: { color: colors.text, fontFamily: fonts.semibold, fontSize: 28, lineHeight: 36 }, help: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 22 }, error: { color: colors.warning, fontFamily: fonts.medium, fontSize: 13 } })
