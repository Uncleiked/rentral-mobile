import { useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Host, Picker } from '@expo/ui'
import { Button } from './Button'
import { Field } from './Field'
import { StatusView } from './StatusView'
import { bookingFeedbackSchema } from '../lib/member-contracts'
import { submitBookingFeedback } from '../lib/member-api'
import { errorMessage } from '../lib/api'
import { bookingOutcomeUncertain } from '../lib/booking-api'
import { useMemberResource } from '../hooks/use-member-resource'
import { colors, fonts, radius, space } from '../theme'

type Props = { bookingId: string; status: string; onChanged: () => Promise<unknown> }

export function BookingFeedback({ bookingId, status, onChanged }: Props) {
  const resource = useMemberResource(`/bookings/${bookingId}/feedback`, bookingFeedbackSchema)
  const [mode, setMode] = useState<'review' | 'report'>(status === 'completed' ? 'review' : 'report')
  const [drafts, setDrafts] = useState({ review: '', report: '' })
  const [rating, setRating] = useState(5)
  const [busy, setBusy] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const pending = useRef(false)
  const canReview = status === 'completed' && !resource.data?.reviewSubmitted
  const canReport = ['confirmed', 'completed', 'disputed'].includes(status) && !resource.data?.openReport
  const activeMode = mode
  const activeAvailable = activeMode === 'review' ? canReview : canReport
  async function submit(): Promise<void> {
    if (pending.current || uncertain || !resource.data || (activeMode === 'review' ? !canReview : !canReport)) return
    const text = drafts[activeMode].trim()
    if (text.length < (activeMode === 'review' ? 10 : 20)) { setFailed(true); setMessage(activeMode === 'review' ? 'Write at least 10 characters about your experience.' : 'Describe the problem in at least 20 characters.'); return }
    pending.current = true; setBusy(true); setMessage(null); setFailed(false)
    try {
      await submitBookingFeedback(bookingId, activeMode === 'review' ? { rating, comment: text } : { reason: text })
      resource.replace({ ...resource.data, ...(activeMode === 'review' ? { reviewSubmitted: true } : { openReport: true }) })
      setDrafts(previous => ({ ...previous, [activeMode]: '' }))
      setMessage(activeMode === 'review' ? 'Your review has been recorded.' : 'Your report has been opened for review. A report does not confirm a refund or payout.')
      await onChanged().catch(() => undefined)
    } catch (reason) { setFailed(true); setMessage(errorMessage(reason)); if (bookingOutcomeUncertain(reason)) setUncertain(true) }
    finally { pending.current = false; setBusy(false) }
  }
  async function checkSubmission(): Promise<void> {
    if (pending.current) return
    pending.current = true; setBusy(true)
    try { await resource.refresh(true); setUncertain(false); setMessage('Your latest submission status is shown. Your text has been kept.'); setFailed(false) }
    catch (reason) { setMessage(errorMessage(reason)); setFailed(true) }
    finally { pending.current = false; setBusy(false) }
  }
  return <View style={styles.card}>
    <Text style={styles.heading}>Your experience</Text>
    {resource.loading ? <StatusView loading message="Checking your feedback…" /> : !resource.data ? <StatusView title="Feedback unavailable" message={resource.error ?? 'Refresh before submitting feedback.'} onRetry={() => { void resource.refresh(true).catch(() => undefined) }} /> : <>
      {resource.data.reviewSubmitted ? <Text style={styles.help}>Your review is recorded for this booking.</Text> : null}
      {resource.data.openReport ? <Text style={styles.help}>You have an open report for this booking. Staff review and payment settlement are separate.</Text> : null}
      {canReview || canReport ? <>
        <View style={styles.choices}>{canReview ? <Button title="Leave a review" secondary={activeMode !== 'review'} disabled={busy} onPress={() => { setMode('review'); setMessage(null) }} /> : null}{canReport ? <Button title="Report a problem" secondary={activeMode !== 'report'} disabled={busy} onPress={() => { setMode('report'); setMessage(null) }} /> : null}</View>
        {activeAvailable ? <>
          <Text style={styles.help}>{activeMode === 'review' ? 'Your review appears on the other participant’s public profile.' : 'Your report is private for staff review. Opening a report does not confirm wrongdoing, a refund or a payout.'}</Text>
          {activeMode === 'review' ? <><Text style={styles.help}>Rating</Text><Host matchContents colorScheme="dark" seedColor={colors.accentBright}><Picker selectedValue={rating} onValueChange={setRating} enabled={!busy && !uncertain} testID="booking-review-rating">{[5, 4, 3, 2, 1].map(value => <Picker.Item key={value} value={value} label={`${value} ${value === 1 ? 'star' : 'stars'}`} />)}</Picker></Host></> : null}
          <Field label={activeMode === 'review' ? 'Share your experience' : 'Describe what happened'} multiline value={drafts[activeMode]} onChangeText={value => setDrafts(previous => ({ ...previous, [activeMode]: value }))} maxLength={activeMode === 'review' ? 2000 : 4000} editable={!busy && !uncertain} />
          {uncertain ? <><Text style={styles.help}>Your submission may have reached Rentral. Check its status before sending another.</Text><Button title="Check submission status" secondary busy={busy} onPress={() => { void checkSubmission() }} /></> : <Button title={activeMode === 'review' ? 'Submit review' : 'Open report'} busy={busy} onPress={() => { void submit() }} />}
        </> : null}
      </> : null}
    </>}
    {message ? <Text selectable accessibilityLiveRegion="polite" style={failed ? styles.error : styles.help}>{message}</Text> : null}
  </View>
}
const styles = StyleSheet.create({ card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, padding: space.xl, gap: space.lg },
  heading: { fontFamily: fonts.semibold, color: colors.text, fontSize: 20 }, help: { fontFamily: fonts.regular, color: colors.muted, fontSize: 13, lineHeight: 22 }, error: { fontFamily: fonts.medium, color: colors.warning, fontSize: 13, lineHeight: 22 }, choices: { gap: space.sm } })
