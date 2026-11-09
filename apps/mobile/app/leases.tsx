import { StyleSheet, Text, View } from 'react-native'
import { Stack, router } from 'expo-router'
import { renewalArchiveSchema, terminationArchiveSchema, type MemberRenewal, type MemberTermination } from '../../../lib/contracts/lifecycle'
import { Page } from '../src/components/Page'
import { Button } from '../src/components/Button'
import { StatusView } from '../src/components/StatusView'
import { useMemberPages } from '../src/hooks/use-member-resource'
import { memberDate, memberStatus } from '../src/lib/member-format'
import { colors, fonts, radius, space } from '../src/theme'

export default function LeasesScreen() {
  const renewals = useMemberPages('/renewals', renewalArchiveSchema)
  const terminations = useMemberPages('/terminations', terminationArchiveSchema)
  const refresh = () => { void renewals.refresh(true).catch(() => undefined); void terminations.refresh(true).catch(() => undefined) }
  function card(item: MemberRenewal | MemberTermination, kind: 'renewal' | 'termination') {
    return <View key={item.id} style={styles.card}><Text style={styles.heading}>{kind === 'renewal' ? 'Lease extension' : 'Early lease end'}</Text>
      <Text style={styles.body}>{memberStatus(item.status)} · You are the {item.role}</Text>
      <Text style={styles.help}>Requested end: {('requestedEndsAt' in item ? item.requestedEndsAt : item.requestedEndAt) ? memberDate(('requestedEndsAt' in item ? item.requestedEndsAt : item.requestedEndAt)!) : 'Details needed'}</Text>
      {item.decisionReason ? <Text style={styles.body}>Review: {item.decisionReason}</Text> : null}
      <Button title={item.actions.confirm ? 'Review lease proposal' : 'View lease request'} secondary onPress={() => router.push({ pathname: '/lease/[id]', params: { id: item.bookingId } })} />
    </View>
  }
  return <Page title="Leases and requests" subtitle="Follow lease extensions and early-end proposals. A proposal changes your recorded lease only after the required review." refreshing={renewals.refreshing || terminations.refreshing} onRefresh={refresh}>
    <Stack.Screen options={{ title: 'Leases and requests', headerShown: true }} />
    <Button title="Open your bookings" secondary onPress={() => router.push('/(tabs)/bookings')} />
    <Text accessibilityRole="header" style={styles.title}>Extension requests</Text>
    {renewals.loading ? <StatusView loading message="Loading extensions…" /> : renewals.error && !renewals.data ? <StatusView title="Extensions unavailable" message={renewals.error} onRetry={refresh} /> : renewals.items.length ? renewals.items.map(item => card(item, 'renewal')) : <Text style={styles.help}>No extension requests. Open a residential booking to propose one.</Text>}
    {renewals.error && renewals.data ? <Text accessibilityRole="alert" style={styles.warning}>{renewals.error}</Text> : null}
    {renewals.hasMore ? <Button title="Older extension requests" secondary busy={renewals.loadingMore} onPress={() => { void renewals.loadMore() }} /> : null}
    {renewals.moreError ? <Text style={styles.warning}>{renewals.moreError}</Text> : null}
    <Text accessibilityRole="header" style={styles.title}>Early-end requests</Text>
    {terminations.loading ? <StatusView loading message="Loading early-end requests…" /> : terminations.error && !terminations.data ? <StatusView title="Early-end requests unavailable" message={terminations.error} onRetry={refresh} /> : terminations.items.length ? terminations.items.map(item => card(item, 'termination')) : <Text style={styles.help}>No early-end requests.</Text>}
    {terminations.error && terminations.data ? <Text accessibilityRole="alert" style={styles.warning}>{terminations.error}</Text> : null}
    {terminations.hasMore ? <Button title="Older early-end requests" secondary busy={terminations.loadingMore} onPress={() => { void terminations.loadMore() }} /> : null}
    {terminations.moreError ? <Text style={styles.warning}>{terminations.moreError}</Text> : null}
  </Page>
}
const styles = StyleSheet.create({ title: { color: colors.text, fontFamily: fonts.semibold, fontSize: 22 }, card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, padding: space.xl, gap: space.md }, heading: { color: colors.text, fontFamily: fonts.semibold, fontSize: 18 }, body: { color: colors.secondary, fontFamily: fonts.regular, fontSize: 14, lineHeight: 22 }, help: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 21 }, warning: { color: colors.warning, fontFamily: fonts.regular, fontSize: 13, lineHeight: 21 } })
