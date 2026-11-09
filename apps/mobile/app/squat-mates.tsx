import type { ReactNode } from 'react'
import { FlatList, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Stack, router } from 'expo-router'
import { matchCandidatePageSchema } from '../../../lib/matching/contracts'
import { Button } from '../src/components/Button'
import { Page } from '../src/components/Page'
import { StatusView } from '../src/components/StatusView'
import { MatchingProfileCard } from '../src/components/matching-profile-card'
import { MatchingContactButton } from '../src/components/matching-contact-button'
import { useMemberPages, useMemberResource } from '../src/hooks/use-member-resource'
import { useAuth } from '../src/providers/AuthProvider'
import { ownMatchingSchema } from '../src/lib/matching-api'
import { useMatchingPrivacy } from '../src/hooks/use-matching-privacy'
import { colors, fonts, space } from '../src/theme'

function Candidates({ header, actorId }: { header: ReactNode; actorId: string }) {
  const candidates = useMemberPages('/squat-mates', matchCandidatePageSchema)
  const refresh = () => { void candidates.refresh(true).catch(() => undefined) }
  return <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}><FlatList data={candidates.items} keyExtractor={item => item.id} contentContainerStyle={styles.content} refreshing={candidates.refreshing} onRefresh={refresh}
    ListHeaderComponent={<View style={styles.section}>{header}{candidates.error && candidates.data ? <Text style={styles.warning}>Could not refresh: {candidates.error}</Text> : null}</View>}
    ListEmptyComponent={candidates.loading ? <StatusView loading message="Finding shared-home preferences…" /> : candidates.error ? <StatusView title="Matching unavailable" message={candidates.error} onRetry={refresh} /> : <StatusView title="No overlapping profiles yet" message="You can change your area or monthly budget preferences and check again later." />}
    renderItem={({ item }) => <MatchingProfileCard profile={item} overlap={item.overlap}><MatchingContactButton profileId={item.id} actorId={actorId} /><Button title="Report this matching profile" secondary onPress={() => router.push({ pathname: '/match-report', params: { profileId: item.id } })} /></MatchingProfileCard>}
    ListFooterComponent={<View style={styles.section}>{candidates.moreError ? <Text style={styles.warning}>{candidates.moreError}</Text> : null}{candidates.hasMore ? <Button title="More matching profiles" secondary busy={candidates.loadingMore} onPress={() => { void candidates.loadMore() }} /> : null}</View>} />
  </SafeAreaView>
}
export default function SquatMatesScreen() {
  const profile = useMemberResource('/squat-mates/profile', ownMatchingSchema)
  const { session } = useAuth()
  const privacy = useMatchingPrivacy(session?.user.id ?? '')
  const header = <><Text accessibilityRole="header" style={styles.title}>Find your shared-home fit.</Text><Text style={styles.help}>Compare stated areas, monthly budgets and routines. These explanations do not predict trust or safety. Both members choose whether to connect.</Text>
    <Button title="My matching preferences and visibility" secondary onPress={() => router.push('/matching-profile')} /><Button title="Matching contact requests and messages" secondary onPress={() => router.push('/matching-connections')} /><Button title="Matching blocks and report history" secondary onPress={() => router.push('/matching-history')} />
    {profile.error ? <Text style={styles.warning}>Could not refresh your preferences: {profile.error}</Text> : null}</>
  return <><Stack.Screen options={{ title: 'Squat-Mates' }} />{profile.data?.canDiscover && session ? <Candidates key={`${session.user.id}:${privacy}`} header={header} actorId={session.user.id} /> : <Page title="Squat-Mates" subtitle="Optional matching for a shared home.">
    {header}{profile.loading ? <StatusView loading message="Opening your matching profile…" /> : !profile.data ? <StatusView title="Preferences unavailable" message={profile.error ?? 'Refresh to check your matching preferences.'} onRetry={() => { void profile.refresh().catch(() => undefined) }} /> : <StatusView title={profile.data.profile?.moderationStatus === 'restricted' ? 'Matching profile under review' : 'Choose when to be discoverable'} message={profile.data.profile?.moderationStatus === 'restricted' ? 'Open your matching preferences to read the current review reason.' : 'Save one to three areas and a monthly budget range, then explicitly enable visibility to discover matching profiles.'} />}
  </Page>}</>
}
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.background }, content: { padding: space.xl, gap: space.xl, paddingBottom: space.xxl }, section: { gap: space.lg }, title: { color: colors.text, fontFamily: fonts.semibold, fontSize: 28, lineHeight: 36 }, help: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 22 }, warning: { color: colors.warning, fontFamily: fonts.medium, fontSize: 13 } })
