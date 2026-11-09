import { useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import { Button } from './Button'
import { Field } from './Field'
import { errorMessage } from '../lib/api'
import { localDateInput } from '../lib/booking-input'
import { bookingRequestInput } from '../lib/booking-request-input'
import { quoteBooking } from '../lib/booking-api'
import type { BookingQuote, BookingRequestInput, HoldConversion } from '../lib/booking-contracts'
import { BookingDateFields } from './booking-date-fields'
import { BookingQuoteSummary } from './booking-summary'
import { useBookingRequestRecovery } from '../hooks/use-booking-request-recovery'
import { BookingRequestRecovery } from './booking-request-recovery'
import { StatusView } from './StatusView'
import { colors, fonts, radius, space } from '../theme'

type Kind = 'inspection' | 'rental' | 'hold'
type Props = { listingId: string; intent: string; hold?: HoldConversion }
export function BookingRequest({ listingId, intent, hold }: Props) {
  const [tomorrow] = useState(() => new Date(Date.now() + 86400000))
  const [kind, setKind] = useState<Kind>(hold ? 'rental' : 'inspection')
  const [date, setDate] = useState(localDateInput(tomorrow))
  const [time, setTime] = useState('10:00')
  const [endDate, setEndDate] = useState(localDateInput(new Date(tomorrow.getTime() + 86400000)))
  const [endTime, setEndTime] = useState('10:00')
  const [holdDays, setHoldDays] = useState('1')
  const [operation, setOperation] = useState<'quote' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const recovery = useBookingRequestRecovery()
  const created = recovery.booking?.id
  const [quote, setQuote] = useState<{ key: string; value: BookingQuote } | null>(null)
  const pending = useRef(false)
  const busy = operation !== null || recovery.busy
  const needsRecovery = Boolean(recovery.record || recovery.recoveryError)
  const key = JSON.stringify({ listingId, kind, date, time, endDate, endTime, holdDays, hold: hold?.id })
  const currentQuote = quote?.key === key ? quote.value : null
  function input(): BookingRequestInput | null {
    try { return bookingRequestInput({ listingId, kind, date, time, endDate, endTime, holdDays, hold }) }
    catch (reason) { setError(errorMessage(reason)); return null }
  }
  async function review(): Promise<void> {
    if (pending.current || busy || !recovery.ready || needsRecovery || created) return
    const request = input()
    if (!request) return
    pending.current = true; setOperation('quote'); setError(null)
    try { setQuote({ key, value: await quoteBooking(request) }) }
    catch (reason) { setError(errorMessage(reason)) }
    finally { pending.current = false; setOperation(null) }
  }
  async function submit(): Promise<void> {
    if (pending.current || busy || !recovery.ready || needsRecovery || created || !currentQuote) return
    const request = input()
    if (!request) return
    setError(null)
    await recovery.send(request)
  }
  const locked = busy || Boolean(created) || needsRecovery || !recovery.ready
  return <View style={styles.card}><Text style={styles.heading}>{hold ? 'Use your hold toward a rental' : 'Plan your visit'}</Text><Text style={styles.help}>{hold ? 'The rental uses the original hold’s dates. The host must accept before the hold expires; sending a request does not allocate its credit.' : 'Choose your dates and review the quote before sending a request. The host confirms availability before payment.'}</Text>
    {!recovery.ready ? <StatusView loading message="Checking saved booking requests…" /> : needsRecovery ? <BookingRequestRecovery recovery={recovery} /> : <>
    {!hold ? <><View style={styles.kinds}>{(['inspection', ...(intent === 'buy' ? [] : ['rental', 'hold'])] as Kind[]).map(value => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: kind === value }} disabled={locked} onPress={() => setKind(value)} style={[styles.kind, kind === value && styles.selected]}><Text style={[styles.kindText, kind === value && styles.active]}>{value === 'inspection' ? 'Inspection' : value === 'rental' ? 'Rental' : 'Hold'}</Text></Pressable>)}</View>
      <BookingDateFields date={date} time={time} endDate={endDate} endTime={endTime} showEnd={kind !== 'inspection'} disabled={locked} onDate={setDate} onTime={setTime} onEndDate={setEndDate} onEndTime={setEndTime} />
    </> : <Text selectable style={styles.help}>{new Date(hold.startsAt).toLocaleString()} to {new Date(hold.endsAt).toLocaleString()}</Text>}
    {kind === 'hold' ? <><Field label="Holding days (1–7)" value={holdDays} onChangeText={setHoldDays} keyboardType="number-pad" maxLength={1} editable={!locked} /><Text style={styles.help}>The dates above describe your intended rental period. Holding days control how long a paid commitment protects the asset.</Text></> : null}
    {currentQuote ? <BookingQuoteSummary quote={currentQuote} preview /> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {created ? <Text accessibilityLiveRegion="polite" style={styles.success}>Request sent. Open your booking to follow its status.</Text> : <>
      <Button title={currentQuote ? 'Refresh quote' : 'Review quote'} secondary={Boolean(currentQuote)} disabled={busy} busy={operation === 'quote'} onPress={() => { void review() }} />
      {currentQuote ? <Button title="Send booking request" disabled={busy} busy={recovery.busy} onPress={() => { void submit() }} /> : null}
    </>}
    </>}
    {recovery.message && (!created || needsRecovery) ? <Text selectable accessibilityLiveRegion="polite" style={styles.help}>{recovery.message}</Text> : null}
    {created ? <Button title="View booking" secondary onPress={() => router.push({ pathname: '/booking/[id]', params: { id: created } })} /> : null}
  </View>
}
const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, padding: space.xl, gap: space.lg }, heading: { color: colors.text, fontFamily: fonts.semibold, fontSize: 20 }, help: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 21 },
  kinds: { flexDirection: 'row', gap: space.sm }, kind: { flex: 1, minHeight: 44, borderRadius: radius.md, backgroundColor: colors.glass, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.sm }, selected: { backgroundColor: colors.accentMuted }, kindText: { color: colors.secondary, fontFamily: fonts.medium, fontSize: 12 }, active: { color: colors.accentBright }, error: { color: colors.warning, fontFamily: fonts.medium, fontSize: 13, lineHeight: 21 }, success: { color: colors.accentBright, fontFamily: fonts.medium, fontSize: 14, lineHeight: 22 },
})
