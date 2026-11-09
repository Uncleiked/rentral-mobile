import { StyleSheet, Text, View } from 'react-native'
import { Stack, router, type Href } from 'expo-router'
import { memberDashboardSchema } from '../../../lib/contracts/dashboard'
import { Page } from '../src/components/Page'
import { Button } from '../src/components/Button'
import { StatusView } from '../src/components/StatusView'
import { useMemberResource } from '../src/hooks/use-member-resource'
import { colors, fonts, radius, space } from '../src/theme'

export default function DashboardScreen() {
  const resource = useMemberResource('/dashboard', memberDashboardSchema)
  const refresh = () => { void resource.refresh(true).catch(() => undefined) }
  const counts = resource.data?.counts, activity = resource.data?.activity
  const cards = counts ? [
    { label: 'Your assets', value: counts.assets, path: '/my-listings' }, { label: 'Active bookings', value: counts.activeBookings, path: '/(tabs)/bookings' },
    { label: 'Saved finds', value: counts.saved, path: '/(tabs)/saved' }, { label: 'Conversations', value: counts.conversations, path: '/(tabs)/messages' },
  ] : []
  return <Page title="Your Rentral" subtitle="Your assets, plans and recorded activity in one place." refreshing={resource.refreshing} onRefresh={refresh}>
    <Stack.Screen options={{ title: 'Your dashboard', headerShown: true }} />
    {resource.loading ? <StatusView loading message="Loading your dashboard…" /> : !resource.data ? <StatusView title="Dashboard unavailable" message={resource.error ?? 'Refresh your account records.'} onRetry={refresh} /> : <>
      {resource.error ? <Text accessibilityRole="alert" style={styles.warning}>Could not refresh: {resource.error}</Text> : null}
      {cards.map(card => <View key={card.path} style={styles.card}><Text style={styles.help}>{card.label}</Text><Text style={styles.count}>{card.value}</Text><Button title={`Open ${card.label.toLowerCase()}`} secondary onPress={() => router.push(card.path as Href)} /></View>)}
      <View style={styles.card}><Text style={styles.heading}>Inventory and history</Text><Text style={styles.body}>{counts!.activeAssets} active assets · {counts!.drafts} drafts</Text><Text style={styles.body}>{counts!.completedRentals} completed rentals</Text></View>
      {activity ? <>
        <Text accessibilityRole="header" style={styles.heading}>Your recorded activity</Text>
        <View style={styles.card}><Text style={styles.help}>Average recorded reply</Text><Text style={styles.count}>{activity.response.averageMinutes === null ? 'Unavailable' : `${activity.response.averageMinutes} min`}</Text><Text style={styles.body}>{activity.response.complete ? `${activity.response.samples} completed incoming-message turns in the last 90 days. Unanswered messages are excluded.` : 'The reporting limit was exceeded. No partial average is shown.'}</Text></View>
        <View style={styles.card}><Text style={styles.help}>Recorded inspection check-ins</Text><Text style={styles.count}>{activity.inspections.ratePercent === null ? 'Unavailable' : `${activity.inspections.ratePercent}%`}</Text><Text style={styles.body}>{activity.inspections.complete ? `${activity.inspections.recorded} of ${activity.inspections.eligible} ended, undisputed inspections in the last 90 days have your check-in recorded.` : 'The reporting limit was exceeded. No partial rate is shown.'}</Text><Text style={styles.help}>Missing check-in evidence does not prove absence.</Text></View>
        <View style={styles.card}><Text style={styles.help}>Completed-booking reviews</Text><Text style={styles.count}>{activity.reviews.averageRating === null ? 'No reviews' : `${activity.reviews.averageRating.toFixed(1)} / 5`}</Text><Text style={styles.body}>{activity.reviews.count} received reviews across completed bookings, over all time.</Text></View>
      </> : null}
      <Button title="Leases and requests" secondary onPress={() => router.push('/leases')} />
      <Button title="Payments and refunds" secondary onPress={() => router.push('/financial')} />
      <Button title="Private media vault" secondary onPress={() => router.push('/vault')} />
      <Button title="Account security" secondary onPress={() => router.push('/settings')} />
    </>}
  </Page>
}
const styles = StyleSheet.create({ card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, padding: space.xl, gap: space.lg }, heading: { color: colors.text, fontFamily: fonts.semibold, fontSize: 21 }, count: { color: colors.text, fontFamily: fonts.bold, fontSize: 28 }, body: { color: colors.secondary, fontFamily: fonts.regular, fontSize: 14, lineHeight: 23 }, help: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 21 }, warning: { color: colors.warning, fontFamily: fonts.regular, fontSize: 13, lineHeight: 21 } })
