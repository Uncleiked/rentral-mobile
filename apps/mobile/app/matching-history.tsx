import { useRef, useState, type ReactNode } from 'react'
import { FlatList, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Stack, useLocalSearchParams } from 'expo-router'
import { matchingBlockPageSchema, ownMatchingReportsSchema } from '../../../lib/matching/contracts'
import { Button } from '../src/components/Button'
import { StatusView } from '../src/components/StatusView'
import { ChoiceChips } from '../src/components/ChoiceChips'
import { useMemberPages } from '../src/hooks/use-member-resource'
import { useAuth } from '../src/providers/AuthProvider'
import { setMatchingBlock } from '../src/lib/matching-api'
import { bookingOutcomeUncertain } from '../src/lib/booking-api'
import { errorMessage } from '../src/lib/api'
import { colors, fonts, radius, space } from '../src/theme'

function Blocks({ header }: { header: ReactNode }) {
  const records = useMemberPages('/squat-mates/blocks', matchingBlockPageSchema)
  const { session } = useAuth()
  const [confirmation, setConfirmation] = useState<string | null>(null), [busy, setBusy] = useState<string | null>(null), [unknown, setUnknown] = useState<string | null>(null), [message, setMessage] = useState<string | null>(null)
  const lock = useRef(false)
  async function refresh() { try { await records.refresh(true); setUnknown(null); setConfirmation(null) } catch (reason) { setMessage(errorMessage(reason)) } }
  async function unblock(profileId: string) {
    if (lock.current || !session || unknown) return
    lock.current = true; setBusy(profileId); setMessage(null)
    try { await setMatchingBlock(profileId, false, session.user.id); setMessage('The block was removed. Closed contacts are not reopened automatically.'); setConfirmation(null); await records.refresh() }
    catch (reason) { setMessage(errorMessage(reason)); if (bookingOutcomeUncertain(reason)) setUnknown(profileId) }
    finally { lock.current = false; setBusy(null) }
  }
  return <FlatList data={records.items} keyExtractor={item => item.id} contentContainerStyle={styles.content} refreshing={records.refreshing} onRefresh={() => { void refresh() }}
    ListHeaderComponent={<View style={styles.section}>{header}<Text style={styles.help}>Blocking stops matching discovery/contact access between the two accounts. Reporting remains available separately.</Text>{message ? <Text selectable style={styles.warning}>{message}</Text> : null}{unknown ? <><Text style={styles.warning}>This block change may already be saved. Refresh its history before another change.</Text><Button title="Check latest matching blocks" secondary onPress={() => { void refresh() }} /></> : null}</View>}
    ListEmptyComponent={records.loading ? <StatusView loading message="Opening blocked contacts…" /> : records.error ? <StatusView title="Block history unavailable" message={records.error} onRetry={() => { void refresh() }} /> : <StatusView title="No blocked matching contacts" message="Use Block contact from a matching conversation when you need to stop matching contact." />}
    renderItem={({ item }) => <View style={styles.card}><Text style={styles.heading}>{item.username ? `@${item.username}` : 'Unavailable former contact'}</Text><Text style={styles.help}>Blocked {new Date(item.createdAt).toLocaleDateString()}</Text>{item.profileId ? confirmation === item.profileId ? <><Text style={styles.help}>Removing a block permits future matching contact when both profiles are visible. It does not restore a closed conversation.</Text><Button title={`Confirm unblocking ${item.username ?? 'matching contact'}`} secondary busy={busy === item.profileId} disabled={Boolean(unknown)} onPress={() => { void unblock(item.profileId!) }} /><Button title="Keep this matching block" secondary disabled={busy !== null} onPress={() => setConfirmation(null)} /></> : <Button title={`Unblock ${item.username ?? 'matching contact'}`} secondary disabled={busy !== null || Boolean(unknown)} onPress={() => setConfirmation(item.profileId)} /> : null}</View>}
    ListFooterComponent={<View style={styles.section}>{records.error && records.data ? <Text style={styles.warning}>Could not refresh: {records.error}</Text> : null}{records.moreError ? <Text style={styles.warning}>{records.moreError}</Text> : null}{records.hasMore ? <Button title="Older matching blocks" secondary busy={records.loadingMore} onPress={() => { void records.loadMore() }} /> : null}</View>} />
}
function Reports({ header }: { header: ReactNode }) {
  const records = useMemberPages('/squat-mates/reports', ownMatchingReportsSchema)
  const refresh = () => { void records.refresh(true).catch(() => undefined) }
  return <FlatList data={records.items} keyExtractor={item => item.id} contentContainerStyle={styles.content} refreshing={records.refreshing} onRefresh={refresh}
    ListHeaderComponent={<View style={styles.section}>{header}<Text style={styles.help}>These are reports you submitted. They are private and reviewed independently; their status does not create a public safety label.</Text>{records.error && records.data ? <Text style={styles.warning}>Could not refresh: {records.error}</Text> : null}</View>}
    ListEmptyComponent={records.loading ? <StatusView loading message="Opening your private reports…" /> : records.error ? <StatusView title="Report history unavailable" message={records.error} onRetry={refresh} /> : <StatusView title="No matching reports" message="Reports you submit from a matching profile, contact or other-member message appear here." />}
    renderItem={({ item }) => <View style={styles.card}><Text style={styles.heading}>{item.status === 'open' ? 'Awaiting independent review' : 'Reviewed report'}</Text><Text selectable style={styles.body}>{item.reason}</Text><Text style={styles.help}>Submitted {new Date(item.createdAt).toLocaleString()}</Text>{item.resolution ? <Text selectable style={styles.body}>Review decision: {item.resolution}</Text> : null}{item.reviewedAt ? <Text style={styles.help}>Reviewed {new Date(item.reviewedAt).toLocaleString()}</Text> : null}</View>}
    ListFooterComponent={<View style={styles.section}>{records.moreError ? <Text style={styles.warning}>{records.moreError}</Text> : null}{records.hasMore ? <Button title="Older private matching reports" secondary busy={records.loadingMore} onPress={() => { void records.loadMore() }} /> : null}</View>} />
}
export default function MatchingHistoryScreen() {
  const params = useLocalSearchParams<{ tab?: string }>()
  const [tab, setTab] = useState<'blocks' | 'reports'>(params.tab === 'reports' ? 'reports' : 'blocks')
  const header = <><Text style={styles.title}>Your matching privacy history.</Text><ChoiceChips label="Matching history" value={tab} options={[{ value: 'blocks', label: 'Blocked contacts' }, { value: 'reports', label: 'My reports' }]} onChange={setTab} /></>
  return <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}><Stack.Screen options={{ title: 'Matching privacy history' }} />{tab === 'blocks' ? <Blocks header={header} /> : <Reports header={header} />}</SafeAreaView>
}
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.background }, content: { padding: space.xl, gap: space.lg, paddingBottom: space.xxl }, section: { gap: space.lg }, card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.xl, padding: space.xl, gap: space.md }, title: { color: colors.text, fontFamily: fonts.semibold, fontSize: 28, lineHeight: 36 }, heading: { color: colors.text, fontFamily: fonts.semibold, fontSize: 17 }, body: { color: colors.secondary, fontFamily: fonts.regular, fontSize: 13, lineHeight: 22 }, help: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 21 }, warning: { color: colors.warning, fontFamily: fonts.medium, fontSize: 13, lineHeight: 22 } })
