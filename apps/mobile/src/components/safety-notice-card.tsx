import { useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Button } from './Button'
import { Field } from './Field'
import type { OwnSafetyNotice } from '../lib/member-contracts'
import { submitSafetyAppeal } from '../lib/member-api'
import { bookingOutcomeUncertain } from '../lib/booking-api'
import { errorMessage } from '../lib/api'
import { memberDate, memberStatus } from '../lib/member-format'
import { colors, fonts, radius, space } from '../theme'

export function SafetyNoticeCard({ notice, refresh }: { notice: OwnSafetyNotice; refresh: () => Promise<unknown> }) {
  const [statement, setStatement] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [uncertain, setUncertain] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const pending = useRef(false)
  async function send(): Promise<void> {
    if (pending.current || uncertain || submitted) return
    if (statement.trim().length < 30) { setMessage('Explain your appeal in at least 30 characters.'); return }
    pending.current = true; setBusy(true); setMessage(null)
    try {
      await submitSafetyAppeal(notice.id, statement.trim())
      setSubmitted(true); setMessage('Your appeal was received. An independent reviewer will consider it. The current notice remains visible until its status changes.')
      await refresh().catch(() => undefined)
    } catch (reason) { setMessage(errorMessage(reason)); if (bookingOutcomeUncertain(reason)) setUncertain(true) }
    finally { pending.current = false; setBusy(false) }
  }
  async function check(): Promise<void> {
    if (pending.current) return
    pending.current = true; setBusy(true)
    try { await refresh(); setUncertain(false); setMessage('The latest appeal status is shown. Your statement has been kept.') }
    catch (reason) { setMessage(errorMessage(reason)) }
    finally { pending.current = false; setBusy(false) }
  }
  return <View style={styles.card}>
    <Text style={styles.heading}>{memberStatus(notice.category)} · {memberStatus(notice.status)}</Text>
    <Text selectable style={styles.body}>{notice.reason}</Text><Text style={styles.help}>Issued {memberDate(notice.createdAt)}</Text>
    {notice.appeal ? <><Text style={styles.label}>Your appeal · {memberStatus(notice.appeal.status)}</Text><Text selectable style={styles.body}>{notice.appeal.statement}</Text>
      {notice.appeal.decisionReason ? <><Text style={styles.label}>Reviewer’s decision</Text><Text selectable style={styles.body}>{notice.appeal.decisionReason}</Text></> : <Text style={styles.help}>An independent reviewer has not issued a decision yet.</Text>}</> : notice.status === 'active' && !submitted ? <>
      <Field label="Your appeal" value={statement} onChangeText={setStatement} multiline maxLength={4000} editable={!busy && !uncertain} placeholder="Explain the concern and the evidence you would like reviewed." />
      {uncertain ? <Button title="Check appeal status" secondary busy={busy} onPress={() => { void check() }} /> : <Button title="Submit appeal" busy={busy} onPress={() => { void send() }} />}
    </> : null}
    {notice.removedAt ? <Text style={styles.help}>Notice removed {memberDate(notice.removedAt)}.</Text> : null}
    {message ? <Text selectable accessibilityLiveRegion="polite" style={styles.feedback}>{message}</Text> : null}
  </View>
}
const styles = StyleSheet.create({ card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, padding: space.xl, gap: space.lg },
  heading: { color: colors.text, fontFamily: fonts.semibold, fontSize: 19 }, label: { color: colors.text, fontFamily: fonts.medium, fontSize: 14 }, body: { color: colors.secondary, fontFamily: fonts.regular, fontSize: 14, lineHeight: 23 },
  help: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 21 }, feedback: { color: colors.warning, fontFamily: fonts.medium, fontSize: 13, lineHeight: 22 } })
