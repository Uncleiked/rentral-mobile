import { useCallback, useState } from 'react'
import { Linking, StyleSheet, Text, View } from 'react-native'
import { Stack, router, useFocusEffect } from 'expo-router'
import { Page } from '../src/components/Page'
import { Button } from '../src/components/Button'
import { StatusView } from '../src/components/StatusView'
import { useApiResource } from '../src/hooks/useApiResource'
import type { OwnerListing } from '../src/lib/native-listing'
import { memberDate, memberStatus } from '../src/lib/member-format'
import { config } from '../src/lib/config'
import { colors, fonts, radius, space } from '../src/theme'

type OwnerListings = { items: OwnerListing[]; limit: number }

export default function MyListingsScreen() {
  const { data, loading, error, refresh } = useApiResource<OwnerListings>('/my-listings')
  const [openingDraft, setOpeningDraft] = useState<string | null>(null)
  const [webError, setWebError] = useState<string | null>(null)
  useFocusEffect(useCallback(() => { refresh() }, [refresh]))
  async function continueDraft(id: string): Promise<void> {
    if (openingDraft) return
    setOpeningDraft(id); setWebError(null)
    try { await Linking.openURL(`${config.apiUrl}/marketplace/listing/create?draft=${encodeURIComponent(id)}`) }
    catch { setWebError('Could not open this draft in your browser. Please try again.') }
    finally { setOpeningDraft(null) }
  }
  return <>
    <Stack.Screen options={{ title: 'My listings', headerShown: true }} />
    <Page title="My listings" subtitle="Manage your homes, cars and boats." refreshing={loading} onRefresh={refresh}>
      <Button title="Create a listing" onPress={() => router.push('/create-listing')} />
      {loading ? <StatusView loading message="Loading your listings…" /> : error ? <StatusView title="Listings unavailable" message={error} onRetry={refresh} /> : !data?.items.length ? <StatusView title="Your next listing starts here" message="Record a walkthrough, add asset details and submit your ownership or listing-authority document for review." /> : data.items.map(item => <View key={item.id} style={styles.card}>
        <View style={styles.top}><Text style={styles.title}>{item.title}</Text><Text style={styles.status}>{memberStatus(item.status)}</Text></View>
        <Text style={styles.amount}>{item.price} <Text style={styles.muted}>/ {item.pricePeriod}</Text></Text>
        <Text style={styles.muted}>Created {memberDate(item.createdAt)}</Text>
        {item.status === 'pending_verification' ? <Text style={styles.help}>Submitted for review. Publication and any fees are confirmed by the server.</Text> : null}
        {item.status !== 'draft' ? <Button title="View listing" secondary onPress={() => router.push({ pathname: '/listing/[id]', params: { id: item.id } })} /> : <>
          <Button title="Continue draft on web" secondary busy={openingDraft === item.id} disabled={Boolean(openingDraft) && openingDraft !== item.id} onPress={() => { void continueDraft(item.id) }} />
          <Text style={styles.help}>Continue this saved draft in your browser. You may need to sign in again.</Text>
        </>}
      </View>)}
      {webError ? <Text accessibilityLiveRegion="polite" style={styles.error}>{webError}</Text> : null}
      {data && data.items.length >= data.limit ? <Text style={styles.muted}>Showing your {data.limit} most recent listings.</Text> : null}
    </Page>
  </>
}

const styles = StyleSheet.create({
  card: { padding: space.xl, borderRadius: radius.xl, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, gap: space.md }, top: { gap: space.sm }, title: { color: colors.text, fontFamily: fonts.semibold, fontSize: 18 },
  status: { color: colors.secondary, fontFamily: fonts.medium, fontSize: 12 }, amount: { color: colors.accentBright, fontFamily: fonts.semibold, fontSize: 20 }, muted: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 20 }, help: { color: colors.secondary, fontFamily: fonts.regular, fontSize: 13, lineHeight: 21 },
  error: { color: colors.warning, fontFamily: fonts.regular, fontSize: 13, lineHeight: 21 },
})
