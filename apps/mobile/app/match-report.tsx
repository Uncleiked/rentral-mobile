import { useMemo, useRef, useState } from 'react'
import { KeyboardAvoidingView, Platform, StyleSheet, Text } from 'react-native'
import { Stack, router, useLocalSearchParams } from 'expo-router'
import { Page } from '../src/components/Page'
import { Field } from '../src/components/Field'
import { Button } from '../src/components/Button'
import { StatusView } from '../src/components/StatusView'
import { useAuth } from '../src/providers/AuthProvider'
import { useMemberResource } from '../src/hooks/use-member-resource'
import { matchingReportContextSchema, submitMatchingReport } from '../src/lib/matching-api'
import { bookingOutcomeUncertain } from '../src/lib/booking-api'
import { errorMessage } from '../src/lib/api'
import { colors, fonts } from '../src/theme'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export default function MatchingReportScreen() {
  const params = useLocalSearchParams<{ profileId?: string; connectionId?: string; messageId?: string }>()
  const connectionId = typeof params.connectionId === 'string' && uuid.test(params.connectionId) ? params.connectionId : null
  const routeProfileId = typeof params.profileId === 'string' && uuid.test(params.profileId) ? params.profileId : null
  const messageId = typeof params.messageId === 'string' && uuid.test(params.messageId) && connectionId ? params.messageId : null
  const contextSchema = useMemo(() => matchingReportContextSchema.refine(value => value.connectionId === connectionId), [connectionId])
  const context = useMemberResource(`/squat-mates/connections/${connectionId ?? 'invalid'}/report-context`, contextSchema, Boolean(connectionId))
  const profileId = connectionId ? context.data?.profileId : routeProfileId
  const { session } = useAuth()
  const [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [unknown, setUnknown] = useState(false), [submitted, setSubmitted] = useState(false), [message, setMessage] = useState<string | null>(null)
  const lock = useRef(false)
  async function submit() {
    if (lock.current || !profileId || !session || unknown || submitted) return
    lock.current = true; setBusy(true); setMessage(null)
    try { await submitMatchingReport({ profileId, ...(connectionId ? { connectionId } : {}), ...(messageId ? { messageId } : {}), reason }, session.user.id); setSubmitted(true); setMessage('Your private report was received for independent review.') }
    catch (failure) { setMessage(errorMessage(failure)); if (bookingOutcomeUncertain(failure)) setUnknown(true) }
    finally { lock.current = false; setBusy(false) }
  }
  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}><Stack.Screen options={{ title: 'Private matching report' }} /><Page title="Report a matching concern" subtitle="This report is private. A reviewer decides what action is appropriate; submitting it does not create a public safety label.">
    {connectionId && context.loading ? <StatusView loading message="Checking your private reporting access…" /> : !profileId ? <StatusView title="Reporting context unavailable" message={context.error ?? 'Open a matching profile or existing contact to report a concern.'} onRetry={connectionId ? () => { void context.refresh().catch(() => undefined) } : undefined} /> : <>
      <Text style={styles.help}>{messageId ? 'This report includes the selected other-member message identifier. Reviewers can check the server record.' : 'Describe what happened clearly. Include dates or context you want an independent reviewer to consider.'} Do not include passwords or payment card details.</Text>
      <Field label="Reason for matching report" value={reason} onChangeText={setReason} multiline maxLength={4000} editable={!busy && !unknown && !submitted} />
      {!unknown && !submitted ? <Button title="Submit private matching report" busy={busy} disabled={reason.trim().length < 20} onPress={() => { void submit() }} /> : null}
      {unknown ? <Text style={styles.help}>Your report may already be recorded. It was not repeated. Check your private report history before deciding whether another report is needed.</Text> : null}
      <Button title="View my matching report history" secondary onPress={() => router.push({ pathname: '/matching-history', params: { tab: 'reports' } })} />
    </>}
    {message ? <Text selectable accessibilityLiveRegion="polite" style={styles.help}>{message}</Text> : null}
  </Page></KeyboardAvoidingView>
}
const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: colors.background }, help: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 22 } })
