import { SectionList, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Stack, router } from 'expo-router'
import type { FinancialOverview } from '../../../lib/contracts/financial'
import { Button } from '../src/components/Button'
import { StatusView } from '../src/components/StatusView'
import { FinancialOperationCard } from '../src/components/financial-operation-card'
import { useFinancialWorkspace } from '../src/hooks/use-financial-workspace'
import { memberAmount, memberDate, memberStatus } from '../src/lib/member-format'
import { colors, fonts, radius, space } from '../src/theme'

type Row = { kind: 'operation'; value: FinancialOverview['operations'][number] } | { kind: 'payment'; value: FinancialOverview['payments'][number] }
type Section = { kind: 'operations' | 'payments'; title: string; data: Row[] }
export default function FinancialScreen() {
  const resource = useFinancialWorkspace()
  const refresh = () => { void resource.refresh(true).catch(() => undefined) }
  const sections: Section[] = [{ kind: 'operations', title: 'Refund and payout requests', data: resource.operations.map(value => ({ kind: 'operation', value })) },
    { kind: 'payments', title: 'Your collected payments', data: resource.payments.map(value => ({ kind: 'payment', value })) }]
  return <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
    <Stack.Screen options={{ title: 'Payments and requests', headerShown: true }} />
    <SectionList<Row, Section> sections={resource.data ? sections : []} stickySectionHeadersEnabled={false} keyExtractor={row => `${row.kind}:${row.value.id}`}
      contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content} refreshing={resource.refreshing} onRefresh={refresh}
      ListHeaderComponent={<View style={styles.header}><Text accessibilityRole="header" style={styles.title}>Payments and requests</Text><Text style={styles.help}>Follow collected payments, request a refund and manage payout recipients.</Text>
        {resource.loading ? <StatusView loading message="Loading your financial records…" /> : !resource.data ? <StatusView title="Financial records unavailable" message={resource.error ?? 'Load your records again.'} onRetry={refresh} /> : <>
          <View style={styles.card}><Text style={styles.heading}>Bank recipients</Text><Text style={styles.help}>Only masked account details are shown. Full bank account numbers are never saved on this device.</Text>
            {resource.data.recipients.length ? resource.data.recipients.map(recipient => <Text key={recipient.id} selectable style={styles.body}>Bank {recipient.bankCode} · account ending {recipient.accountLast4} · {memberStatus(recipient.status)} · {memberStatus(recipient.environment)} mode</Text>) : <Text style={styles.help}>No bank recipient has been saved.</Text>}
            <Button title="Manage bank recipients" secondary onPress={() => router.push('/bank-recipient')} /></View>
          {!resource.data.settlementAvailable ? <Text style={styles.help}>Provider settlement is currently unavailable. Your existing history is shown, and eligible requests can still be recorded for review. No transfer is confirmed here.</Text> : null}
          {resource.error ? <Text accessibilityRole="alert" style={styles.error}>Could not refresh: {resource.error}</Text> : null}
          <Button title="Recover a saved request" secondary onPress={() => router.push('/financial-request')} />
        </>}</View>}
      renderSectionHeader={({ section }) => <Text accessibilityRole="header" style={styles.sectionTitle}>{section.title}</Text>}
      renderItem={({ item: row }) => <View style={styles.item}>{row.kind === 'operation' ? <FinancialOperationCard operation={row.value} /> : <View style={styles.card}>
        <Text style={styles.heading}>Payment · {memberStatus(row.value.status)}</Text><Text selectable style={styles.amount}>{memberAmount(row.value.amountKobo)}</Text><Text selectable style={styles.help}>Paystack {row.value.environment ?? 'unverified'} mode · Reference: {row.value.reference}</Text><Text style={styles.help}>Collected {memberDate(row.value.createdAt)}</Text>
        <Text selectable style={styles.body}>Unreserved amount: {memberAmount(row.value.availableKobo)}</Text><Text style={styles.help}>This amount excludes existing refund and payout reservations. It does not guarantee refund eligibility.</Text>
        {BigInt(row.value.availableKobo) > BigInt(0) ? <Button title="Request a refund" secondary onPress={() => router.push({ pathname: '/financial-request', params: { kind: 'refund', paymentId: row.value.id } })} /> : null}
        {row.value.bookingId ? <Button title="View related booking" secondary onPress={() => router.push({ pathname: '/booking/[id]', params: { id: row.value.bookingId! } })} /> : null}
      </View>}</View>}
      renderSectionFooter={({ section }) => <View style={styles.footer}>{!section.data.length ? <Text style={styles.help}>{section.kind === 'operations' ? 'No refund or payout requests to show.' : 'No collected payments to show.'}</Text> : null}
        {(section.kind === 'operations' ? resource.operationsCursor : resource.paymentsCursor) ? <Button title={section.kind === 'operations' ? 'Older requests' : 'Older payments'} secondary busy={resource.loadingMore === section.kind} disabled={resource.loadingMore !== null} onPress={() => { void resource.more(section.kind) }} /> : null}
      </View>}
      ListFooterComponent={resource.moreError ? <Text accessibilityRole="alert" style={styles.error}>{resource.moreError}</Text> : undefined} />
  </SafeAreaView>
}
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.background }, content: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: space.xl, paddingBottom: space.xxl }, header: { gap: space.lg },
  title: { color: colors.text, fontFamily: fonts.bold, fontSize: 30 }, heading: { color: colors.text, fontFamily: fonts.semibold, fontSize: 19 }, sectionTitle: { color: colors.text, fontFamily: fonts.semibold, fontSize: 21, paddingVertical: space.xl },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, padding: space.xl, gap: space.lg }, body: { color: colors.secondary, fontFamily: fonts.regular, fontSize: 14, lineHeight: 23 },
  help: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 21 }, error: { color: colors.warning, fontFamily: fonts.medium, fontSize: 13, lineHeight: 22 }, amount: { color: colors.accentBright, fontFamily: fonts.bold, fontSize: 22, fontVariant: ['tabular-nums'] }, item: { marginBottom: space.lg }, footer: { gap: space.md, paddingBottom: space.md } })
