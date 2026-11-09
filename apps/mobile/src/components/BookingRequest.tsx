import { useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import { Button } from './Button'
import { Field } from './Field'
import { api, ApiError, errorMessage } from '../lib/api'
import { bookingDateTime, localDateInput } from '../lib/booking-input'
import { colors, fonts, radius, space } from '../theme'

type Kind = 'inspection' | 'rental' | 'hold'
type Props = { listingId: string; intent: string }
export function BookingRequest({ listingId, intent }: Props) {
  const [tomorrow] = useState(() => new Date(Date.now() + 86400000))
  const [kind, setKind] = useState<Kind>('inspection')
  const [date, setDate] = useState(localDateInput(tomorrow))
  const [time, setTime] = useState('10:00')
  const [endDate, setEndDate] = useState(localDateInput(new Date(tomorrow.getTime() + 86400000)))
  const [holdDays, setHoldDays] = useState('1')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uncertain, setUncertain] = useState(false)
  const [created, setCreated] = useState(false)
  const pending = useRef(false)
  async function submit(): Promise<void> {
    if (pending.current || uncertain || created) return
    const startsAt = bookingDateTime(date, time)
    const days = Number(holdDays)
    if (!startsAt || Date.parse(startsAt) <= Date.now() || (kind === 'hold' && (!Number.isInteger(days) || days < 1 || days > 7))) { setError('Choose future dates and valid times. Holding periods are 1–7 days.'); return }
    const endsAt = kind === 'rental' ? bookingDateTime(endDate, time) : new Date(Date.parse(startsAt) + (kind === 'inspection' ? 3600000 : days * 86400000)).toISOString()
    if (!endsAt || Date.parse(endsAt) <= Date.parse(startsAt)) { setError('Choose an end date after your start date.'); return }
    pending.current = true; setBusy(true); setError(null)
    try { await api<{ id: string }>('/bookings', { method: 'POST', body: { listingId, kind, startsAt, endsAt, ...(kind === 'hold' ? { holdDays: days } : {}) } }); setCreated(true) }
    catch (reason) {
      setError(errorMessage(reason))
      if (reason instanceof ApiError && (reason.status === 0 || reason.status >= 500 || reason.code === 'INVALID_RESPONSE')) setUncertain(true)
    } finally { pending.current = false; setBusy(false) }
  }
  return <View style={styles.card}><Text style={styles.heading}>Plan your visit</Text><Text style={styles.help}>Choose your dates to send a request. The host confirms availability before payment.</Text>
    <View style={styles.kinds}>{(['inspection', ...(intent === 'buy' ? [] : ['rental', 'hold'])] as Kind[]).map(value => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: kind === value }} disabled={busy || created || uncertain} onPress={() => setKind(value)} style={[styles.kind, kind === value && styles.selected]}><Text style={[styles.kindText, kind === value && styles.active]}>{value === 'inspection' ? 'Inspection' : value === 'rental' ? 'Rental' : 'Hold'}</Text></Pressable>)}</View>
    <Field label="Start date (YYYY-MM-DD)" value={date} onChangeText={setDate} placeholder="2026-12-01" editable={!busy && !created && !uncertain} />
    <Field label="Time on this device (HH:MM, 24 hour)" value={time} onChangeText={setTime} placeholder="10:00" editable={!busy && !created && !uncertain} />
    {kind === 'rental' ? <Field label="End date (YYYY-MM-DD)" value={endDate} onChangeText={setEndDate} editable={!busy && !created && !uncertain} /> : kind === 'hold' ? <Field label="Holding days (1–7)" value={holdDays} onChangeText={setHoldDays} keyboardType="number-pad" maxLength={1} editable={!busy && !created && !uncertain} /> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {created ? <Text accessibilityLiveRegion="polite" style={styles.success}>Request sent. You can follow its status in Bookings.</Text> : uncertain ? <Text style={styles.help}>This request may have reached Rentral. Check your bookings before creating another request.</Text> : <Button title="Send booking request" busy={busy} onPress={() => { void submit() }} />}
    {created || uncertain ? <Button title="View bookings" secondary onPress={() => router.push('/(tabs)/bookings')} /> : null}
  </View>
}
const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, padding: space.xl, gap: space.lg }, heading: { color: colors.text, fontFamily: fonts.semibold, fontSize: 20 }, help: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 21 },
  kinds: { flexDirection: 'row', gap: space.sm }, kind: { flex: 1, minHeight: 44, borderRadius: radius.md, backgroundColor: colors.glass, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.sm }, selected: { backgroundColor: colors.accentMuted }, kindText: { color: colors.secondary, fontFamily: fonts.medium, fontSize: 12 }, active: { color: colors.accentBright }, error: { color: colors.warning, fontFamily: fonts.medium, fontSize: 13, lineHeight: 21 }, success: { color: colors.accentBright, fontFamily: fonts.medium, fontSize: 14, lineHeight: 22 },
})
