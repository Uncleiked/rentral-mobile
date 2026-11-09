import { SectionList, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Stack, router } from 'expo-router'
import { ownerVaultPageSchema } from '../../../lib/contracts/listings'
import { Button } from '../src/components/Button'
import { StatusView } from '../src/components/StatusView'
import { OwnerListingCard } from '../src/components/owner-listing-card'
import { useMemberPages } from '../src/hooks/use-member-resource'
import { colors, fonts, space } from '../src/theme'

export default function VaultScreen() {
  const resource = useMemberPages('/vault?limit=20', ownerVaultPageSchema)
  const groups = new Map<string, { title: string; data: typeof resource.items }>()
  for (const item of resource.items) {
    const date = new Date(item.createdAt).toLocaleDateString('en-NG', { timeZone: 'Africa/Lagos', day: 'numeric', month: 'long', year: 'numeric' })
    const key = `${item.area}:${date}`
    const group = groups.get(key) ?? { title: `${item.area} · ${date}`, data: [] }
    group.data.push(item); groups.set(key, group)
  }
  const refresh = () => { void resource.refresh(true).catch(() => undefined) }
  return <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
    <Stack.Screen options={{ title: 'Private media vault', headerShown: true }} />
    <SectionList sections={[...groups.values()]} stickySectionHeadersEnabled={false} keyExtractor={item => item.id} contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic" refreshing={resource.refreshing} onRefresh={refresh}
      ListHeaderComponent={<View style={styles.header}><Text accessibilityRole="header" style={styles.title}>Private media vault</Text><Text style={styles.help}>Server-saved draft walkthroughs stay private. Open a capture to view fresh authorized media or continue its listing. Device-only recordings remain in listing recovery until saved.</Text><Button title="Open device draft recovery" secondary onPress={() => router.push('/create-listing')} />{resource.error && resource.data ? <Text accessibilityRole="alert" style={styles.warning}>Could not refresh: {resource.error}</Text> : null}</View>}
      ListEmptyComponent={resource.loading ? <StatusView loading message="Loading your saved captures…" /> : resource.error ? <StatusView title="Media vault unavailable" message={resource.error} onRetry={refresh} /> : <StatusView title="No saved captures yet" message="Record a walkthrough and save its draft to keep a private server copy here." />}
      renderItem={({ item }) => <OwnerListingCard listing={item} />}
      renderSectionHeader={({ section }) => <Text accessibilityRole="header" style={styles.heading}>{section.title}</Text>}
      ListFooterComponent={<View style={styles.header}>{resource.moreError ? <Text accessibilityRole="alert" style={styles.warning}>{resource.moreError}</Text> : null}{resource.hasMore ? <Button title="Older saved captures" secondary busy={resource.loadingMore} onPress={() => { void resource.loadMore() }} /> : null}</View>} />
  </SafeAreaView>
}
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.background }, content: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: space.xl, paddingBottom: space.xxl, gap: space.lg }, header: { gap: space.lg }, title: { color: colors.text, fontFamily: fonts.bold, fontSize: 30 }, heading: { color: colors.text, fontFamily: fonts.semibold, fontSize: 20, paddingVertical: space.lg }, help: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 22 }, warning: { color: colors.warning, fontFamily: fonts.medium, fontSize: 13, lineHeight: 22 } })
