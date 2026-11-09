import { useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Checkbox, Column, Host, Picker, Switch } from '@expo/ui'
import type { z } from 'zod'
import { MATCH_AREAS, MATCH_AREA_LABELS } from '../../../../lib/matching/policy'
import { matchingForm, saveMatchingProfile, withdrawMatchingProfile, type ownMatchingSchema, type MatchingForm } from '../lib/matching-api'
import { bookingOutcomeUncertain } from '../lib/booking-api'
import { errorMessage } from '../lib/api'
import { Field } from './Field'
import { Button } from './Button'
import { colors, fonts, space } from '../theme'

type Snapshot = z.infer<typeof ownMatchingSchema>
export function MatchingProfileEditor({ saved, actorId, onSaved, refresh }: { saved: Snapshot; actorId: string; onSaved: (value: Snapshot) => void; refresh: () => Promise<Snapshot> }) {
  const [form, setForm] = useState(() => matchingForm(saved.profile))
  const [busy, setBusy] = useState(false), [unknown, setUnknown] = useState(false), [confirmWithdraw, setConfirmWithdraw] = useState(false), [message, setMessage] = useState<string | null>(null)
  const pending = useRef(false)
  const change = <K extends keyof MatchingForm>(key: K, value: MatchingForm[K]) => setForm(previous => ({ ...previous, [key]: value }))
  async function save(withdraw = false) {
    if (pending.current || unknown) return
    pending.current = true; setBusy(true); setMessage(null)
    try {
      if (withdraw) { await withdrawMatchingProfile(actorId); const next = await refresh(); setForm(matchingForm(next.profile)); onSaved(next) }
      else onSaved(await saveMatchingProfile(form, actorId))
      setConfirmWithdraw(false); setMessage(withdraw ? 'Your matching profile is hidden. You can choose visibility again later.' : 'Your matching preferences are saved.')
    } catch (reason) { setMessage(errorMessage(reason)); if (bookingOutcomeUncertain(reason)) setUnknown(true) }
    finally { pending.current = false; setBusy(false) }
  }
  async function check() {
    if (pending.current) return
    pending.current = true; setBusy(true)
    try { const next = await refresh(); setForm(matchingForm(next.profile)); setUnknown(false); setConfirmWithdraw(false); setMessage('The saved server preferences are shown. No update was repeated.') }
    catch (reason) { setMessage(errorMessage(reason)) }
    finally { pending.current = false; setBusy(false) }
  }
  const disabled = busy || unknown
  return <View style={styles.section}>
    {saved.profile?.moderationStatus === 'restricted' ? <><Text style={styles.warning}>Your matching profile is restricted after review.</Text><Text selectable style={styles.help}>{saved.profile.moderationReason ?? 'Review your preferences and contact Rentral if you need clarification.'}</Text></> : null}
    <Field label="About your shared-home preferences" value={form.bio} onChangeText={value => change('bio', value)} maxLength={500} multiline editable={!disabled} />
    <Text style={styles.heading}>Choose one to three Lagos areas</Text><Text style={styles.help}>These are coarse search preferences. Do not include an exact home address or private contact details.</Text>
    <Host matchContents colorScheme="dark" seedColor={colors.accentBright}><Column spacing={space.md}>{MATCH_AREAS.map(area => <Checkbox key={area} value={form.neighborhoods.includes(area)} label={MATCH_AREA_LABELS[area]} disabled={disabled || (!form.neighborhoods.includes(area) && form.neighborhoods.length >= 3)} testID={`matching-area-${area}`} onValueChange={value => change('neighborhoods', value ? [...form.neighborhoods, area] : form.neighborhoods.filter(item => item !== area))} />)}</Column></Host>
    <Field label="Minimum monthly budget in naira" value={form.minNaira} onChangeText={value => change('minNaira', value)} keyboardType="decimal-pad" inputMode="decimal" editable={!disabled} maxLength={17} />
    <Field label="Maximum monthly budget in naira" value={form.maxNaira} onChangeText={value => change('maxNaira', value)} keyboardType="decimal-pad" inputMode="decimal" editable={!disabled} maxLength={17} />
    <Host matchContents colorScheme="dark" seedColor={colors.accentBright}><Column spacing={space.lg}>
      <Picker selectedValue={form.smoking} onValueChange={value => change('smoking', value)} enabled={!disabled} testID="matching-smoking"><Picker.Item value="smoke_free" label="Smoke-free home" /><Picker.Item value="smoking_ok" label="Smoking is okay" /><Picker.Item value="flexible" label="Smoking: flexible" /></Picker>
      <Picker selectedValue={form.pets} onValueChange={value => change('pets', value)} enabled={!disabled} testID="matching-pets"><Picker.Item value="pet_free" label="Pet-free home" /><Picker.Item value="pets_ok" label="Pets are okay" /><Picker.Item value="flexible" label="Pets: flexible" /></Picker>
      <Picker selectedValue={form.guests} onValueChange={value => change('guests', value)} enabled={!disabled} testID="matching-guests"><Picker.Item value="quiet" label="Few guests" /><Picker.Item value="occasional" label="Occasional guests" /><Picker.Item value="social" label="Social home" /><Picker.Item value="flexible" label="Guests: flexible" /></Picker>
      <Picker selectedValue={form.quietHours} onValueChange={value => change('quietHours', value)} enabled={!disabled} testID="matching-quiet-hours"><Picker.Item value="early" label="Earlier quiet hours" /><Picker.Item value="late" label="Later quiet hours" /><Picker.Item value="flexible" label="Quiet hours: flexible" /></Picker>
      <Switch value={form.isVisible} onValueChange={value => change('isVisible', value)} label="Make my matching profile discoverable" disabled={disabled} testID="matching-profile-visible" />
    </Column></Host>
    <Text style={styles.help}>Discovery is optional and starts off. A contact request must be accepted by the other member before messages are available. Visibility does not verify a person or asset.</Text>
    {unknown ? <><Text style={styles.warning}>The update may already be saved. Checking below replaces this form with the current server values before you make another change.</Text><Button title="Check saved matching preferences" secondary busy={busy} onPress={() => { void check() }} /></> : <Button title="Save matching preferences" busy={busy} onPress={() => { void save() }} />}
    {!unknown ? <><Text style={styles.help}>Loading saved preferences replaces any unsaved changes in this form.</Text><Button title="Load server matching preferences" secondary disabled={busy} onPress={() => { void check() }} /></> : null}
    {saved.profile?.isVisible && !unknown ? confirmWithdraw ? <><Text style={styles.warning}>Hiding your profile prevents new discovery and matching contact access while it is hidden. Existing records are retained privately.</Text><Button title="Confirm hiding my matching profile" secondary disabled={busy} onPress={() => { void save(true) }} /><Button title="Keep matching profile visible" secondary disabled={busy} onPress={() => setConfirmWithdraw(false)} /></> : <Button title="Hide my matching profile" secondary disabled={busy} onPress={() => setConfirmWithdraw(true)} /> : null}
    {message ? <Text selectable accessibilityLiveRegion="polite" style={styles.warning}>{message}</Text> : null}
  </View>
}
const styles = StyleSheet.create({ section: { gap: space.lg }, heading: { color: colors.text, fontFamily: fonts.semibold, fontSize: 17 }, help: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 22 }, warning: { color: colors.warning, fontFamily: fonts.medium, fontSize: 13, lineHeight: 22 } })
