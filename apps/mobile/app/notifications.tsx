import { useRef, useState } from 'react'
import { FlatList, Linking, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Stack, router } from 'expo-router'
import { Button } from '../src/components/Button'
import { StatusView } from '../src/components/StatusView'
import { useMemberPages } from '../src/hooks/use-member-resource'
import { notificationDestination, notificationPageSchema, type MemberNotification } from '../src/lib/member-contracts'
import { markNotificationRead } from '../src/lib/member-api'
import { memberDate, memberTime } from '../src/lib/member-format'
import { errorMessage } from '../src/lib/api'
import { config } from '../src/lib/config'
import { colors, fonts, radius, space } from '../src/theme'

export default function NotificationsScreen() {
  const resource = useMemberPages('/notifications?limit=20', notificationPageSchema)
  const [read, setRead] = useState<Record<string, string>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pending = useRef(false)
  async function mark(item: MemberNotification): Promise<boolean> {
    if (item.readAt || read[item.id]) return true
    const result = await markNotificationRead(item.id)
    setRead(previous => ({ ...previous, [result.id]: result.readAt }))
    return true
  }
  async function act(item: MemberNotification, open: boolean): Promise<void> {
    if (pending.current) return
    pending.current = true; setBusyId(item.id); setError(null)
    try {
      await mark(item)
      if (open) {
        const destination = notificationDestination(item.href)
        if (destination) router.push(destination)
        else await Linking.openURL(`${config.apiUrl}/marketplace/notifications`)
      }
    } catch (reason) { setError(errorMessage(reason)) }
    finally { pending.current = false; setBusyId(null) }
  }
  return <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
    <Stack.Screen options={{ title: 'Notifications', headerShown: true }} />
    <FlatList data={resource.items} keyExtractor={item => item.id} contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic" refreshing={resource.refreshing} onRefresh={() => { void resource.refresh(true).catch(() => undefined) }}
      ListHeaderComponent={<View style={styles.header}><Text accessibilityRole="header" style={styles.title}>In the loop</Text><Text style={styles.help}>Booking updates, conversations and reminders for your account.</Text>{resource.error && resource.data ? <Text accessibilityRole="alert" style={styles.error}>Could not refresh: {resource.error}</Text> : null}{error ? <Text accessibilityRole="alert" selectable style={styles.error}>{error}</Text> : null}</View>}
      ListEmptyComponent={resource.loading ? <StatusView loading message="Loading notifications…" /> : resource.error ? <StatusView title="Notifications unavailable" message={resource.error} onRetry={() => { void resource.refresh(true).catch(() => undefined) }} /> : <StatusView title="You’re all caught up" message="Updates will appear here when something needs your attention." />}
      renderItem={({ item }) => {
        const isRead = Boolean(item.readAt || read[item.id])
        const destination = notificationDestination(item.href)
        return <View style={[styles.card, !isRead && styles.unread]}>
          <Text style={styles.heading}>{item.title}</Text><Text selectable style={styles.body}>{item.body}</Text><Text style={styles.help}>{memberDate(item.createdAt)} at {memberTime(item.createdAt)} · {isRead ? 'Read' : 'Unread'}</Text>
          {item.href ? <Button title={destination ? 'Open details' : 'View notification on web'} secondary disabled={Boolean(busyId)} busy={busyId === item.id} onPress={() => { void act(item, true) }} /> : !isRead ? <Button title="Mark as read" secondary disabled={Boolean(busyId)} busy={busyId === item.id} onPress={() => { void act(item, false) }} /> : null}
          {item.href && !destination ? <Text style={styles.help}>This item opens in your browser. You may need to sign in again.</Text> : null}
        </View>
      }}
      ListFooterComponent={<View style={styles.header}>{resource.moreError ? <Text accessibilityRole="alert" style={styles.error}>{resource.moreError}</Text> : null}{resource.hasMore ? <Button title="Older notifications" secondary busy={resource.loadingMore} onPress={() => { void resource.loadMore() }} /> : null}</View>} />
  </SafeAreaView>
}
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.background }, content: { padding: space.xl, paddingBottom: space.xxl, gap: space.lg, width: '100%', maxWidth: 760, alignSelf: 'center' },
  header: { gap: space.md }, title: { fontFamily: fonts.bold, color: colors.text, fontSize: 30 }, card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, padding: space.xl, gap: space.md }, unread: { borderColor: colors.accent },
  heading: { color: colors.text, fontFamily: fonts.semibold, fontSize: 18 }, body: { color: colors.secondary, fontFamily: fonts.regular, fontSize: 14, lineHeight: 23 }, help: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 21 }, error: { color: colors.warning, fontFamily: fonts.medium, fontSize: 13, lineHeight: 22 } })
