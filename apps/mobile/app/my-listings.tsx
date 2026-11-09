import { FlatList, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Stack, router } from 'expo-router'
import { ownerListingPageSchema } from '../../../lib/contracts/listings'
import { Button } from '../src/components/Button'
import { StatusView } from '../src/components/StatusView'
import { OwnerListingCard } from '../src/components/owner-listing-card'
import { useMemberPages } from '../src/hooks/use-member-resource'
import { colors, fonts, space } from '../src/theme'

export default function MyListingsScreen() {
  const resource = useMemberPages('/my-listings?limit=20', ownerListingPageSchema)
  const refresh = () => { void resource.refresh(true).catch(() => undefined) }
  return <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
    <Stack.Screen options={{ title: 'My listings', headerShown: true }} />
    <FlatList data={resource.items} keyExtractor={item => item.id} contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic" refreshing={resource.refreshing} onRefresh={refresh}
      ListHeaderComponent={<View style={styles.header}><Text accessibilityRole="header" style={styles.title}>My listings</Text><Text style={styles.help}>Your homes, cars and boats, including saved drafts and archived listings.</Text>
        <Button title="Create or recover a listing" onPress={() => router.push('/create-listing')} /><Button title="Private media vault" secondary onPress={() => router.push('/vault')} />
        {resource.error && resource.data ? <Text accessibilityRole="alert" style={styles.error}>Could not refresh: {resource.error}</Text> : null}
      </View>}
      ListEmptyComponent={resource.loading ? <StatusView loading message="Loading your listings…" /> : resource.error ? <StatusView title="Listings unavailable" message={resource.error} onRetry={refresh} /> : <StatusView title="Your next listing starts here" message="Record a walkthrough, add the details and privately submit your ownership or listing-authority document for asset review." />}
      renderItem={({ item }) => <OwnerListingCard listing={item} />}
      ListFooterComponent={<View style={styles.header}>{resource.moreError ? <Text accessibilityRole="alert" style={styles.error}>{resource.moreError}</Text> : null}{resource.hasMore ? <Button title="Older listings" secondary busy={resource.loadingMore} onPress={() => { void resource.loadMore() }} /> : null}</View>} />
  </SafeAreaView>
}
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.background }, content: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: space.xl, paddingBottom: space.xxl, gap: space.lg }, header: { gap: space.lg }, title: { color: colors.text, fontFamily: fonts.bold, fontSize: 30 }, help: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 22 }, error: { color: colors.warning, fontFamily: fonts.medium, fontSize: 13, lineHeight: 22 } })
