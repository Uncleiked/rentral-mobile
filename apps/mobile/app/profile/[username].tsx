import { StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Stack, useLocalSearchParams } from 'expo-router'
import { StatusView } from '../../src/components/StatusView'
import { PublicMemberView } from '../../src/components/public-member-view'
import { useMemberPages, useMemberResource } from '../../src/hooks/use-member-resource'
import { profileListingsSchema, publicMemberSchema, reviewPageSchema } from '../../src/lib/member-contracts'
import { colors } from '../../src/theme'

export default function PublicMemberScreen() {
  const params = useLocalSearchParams<{ username: string }>()
  const username = typeof params.username === 'string' ? params.username.toLowerCase() : ''
  const valid = /^[a-z0-9_]{3,24}$/.test(username)
  const path = `/profiles/${encodeURIComponent(username)}`
  const profile = useMemberResource(path, publicMemberSchema, valid)
  const reviews = useMemberPages(`${path}/reviews?limit=20`, reviewPageSchema, valid)
  const listings = useMemberPages(`${path}/listings?limit=12`, profileListingsSchema, valid)
  function refresh(): void { void profile.refresh(true).catch(() => undefined); void reviews.refresh().catch(() => undefined); void listings.refresh().catch(() => undefined) }
  return <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
    <Stack.Screen options={{ title: profile.data ? `@${profile.data.username}` : 'Member', headerShown: true }} />
    {!valid ? <StatusView title="Profile unavailable" message="This profile link is invalid." /> : profile.loading ? <StatusView loading message="Opening this profile…" /> : !profile.data ? <StatusView title="Profile unavailable" message={profile.error ?? 'This member could not be found.'} onRetry={refresh} />
      : <PublicMemberView member={profile.data} reviews={reviews} listings={listings} error={profile.error} refreshing={profile.refreshing} onRefresh={refresh} />}
  </SafeAreaView>
}
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.background } })
