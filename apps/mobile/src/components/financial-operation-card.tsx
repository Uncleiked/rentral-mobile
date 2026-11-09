import { useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import type { FinancialOperationDTO } from '../../../../lib/contracts/financial'
import { Button } from './Button'
import { reconcileFinancialOperation } from '../lib/financial-api'
import { memberAmount, memberDate, memberStatus } from '../lib/member-format'
import { errorMessage } from '../lib/api'
import { useAuth } from '../providers/AuthProvider'
import { colors, fonts, radius, space } from '../theme'

export function FinancialOperationCard({ operation }: { operation: FinancialOperationDTO }) {
  const { session } = useAuth()
  const [updated, setUpdated] = useState<{ base: FinancialOperationDTO; value: FinancialOperationDTO } | null>(null)
  const value = updated?.base === operation ? updated.value : operation
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const pending = useRef(false)
  async function reconcile(): Promise<void> {
    if (pending.current || !session) return
    pending.current = true; setBusy(true); setMessage(null)
    try { setUpdated({ base: operation, value: await reconcileFinancialOperation(value.id, session.user.id) }); setMessage('The latest verified provider status is shown. Collection, refunds and payouts are separate operations.') }
    catch (reason) { setMessage(errorMessage(reason)) }
    finally { pending.current = false; setBusy(false) }
  }
  return <View style={styles.card}>
    <Text style={styles.heading}>{memberStatus(value.kind)} · {memberStatus(value.status)}</Text>
    <Text style={styles.help}>Paystack {value.environment} mode{value.environment === 'test' ? ' · This is a test operation.' : ''}</Text>
    <Text selectable style={styles.amount}>{memberAmount(value.amountKobo)}</Text>
    <Text selectable style={styles.help}>Reference: {value.reference}</Text>
    <Text selectable style={styles.body}>{value.reason}</Text>
    <Text style={styles.help}>Requested {memberDate(value.createdAt)}{value.providerStatus ? ` · Provider: ${memberStatus(value.providerStatus)}` : ''}</Text>
    {value.status === 'succeeded' ? <Text style={styles.help}>The provider has confirmed this {value.kind}. Bank processing times may apply.</Text> : <Text style={styles.help}>A request, approval or collected payment does not confirm that this {value.kind} has been paid.</Text>}
    {BigInt(value.retainedKobo) > BigInt(0) ? <Text selectable style={styles.help}>Reviewed policy retention: {memberAmount(value.retainedKobo)}. Policy: {value.policyVersion ?? 'Unavailable'}.</Text> : null}
    {value.failureCode ? <Text selectable style={styles.feedback}>Provider follow-up: {memberStatus(value.failureCode)}</Text> : null}
    {value.actions.reconcile ? <Button title="Check operation status" secondary busy={busy} onPress={() => { void reconcile() }} /> : null}
    {value.bookingId ? <Button title="View related booking" secondary onPress={() => router.push({ pathname: '/booking/[id]', params: { id: value.bookingId! } })} /> : null}
    {message ? <Text selectable accessibilityLiveRegion="polite" style={styles.feedback}>{message}</Text> : null}
  </View>
}
const styles = StyleSheet.create({ card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, padding: space.xl, gap: space.lg },
  heading: { color: colors.text, fontFamily: fonts.semibold, fontSize: 19 }, amount: { color: colors.accentBright, fontFamily: fonts.bold, fontSize: 23, fontVariant: ['tabular-nums'] }, body: { color: colors.secondary, fontFamily: fonts.regular, fontSize: 14, lineHeight: 23 },
  help: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 21 }, feedback: { color: colors.warning, fontFamily: fonts.medium, fontSize: 13, lineHeight: 22 } })
