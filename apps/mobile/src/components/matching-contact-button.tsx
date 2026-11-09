import { useRef, useState } from 'react'
import { Text, StyleSheet } from 'react-native'
import { router } from 'expo-router'
import { matchConnectionPageSchema } from '../../../../lib/matching/contracts'
import { requestMatchingContact } from '../lib/matching-api'
import { memberGet } from '../lib/member-api'
import { bookingOutcomeUncertain } from '../lib/booking-api'
import { errorMessage } from '../lib/api'
import { Button } from './Button'
import { colors, fonts } from '../theme'

export function MatchingContactButton({ profileId, actorId }: { profileId: string; actorId: string }) {
  const [busy, setBusy] = useState(false), [unknown, setUnknown] = useState(false), [checked, setChecked] = useState(false), [message, setMessage] = useState<string | null>(null)
  const lock = useRef(false)
  async function request() {
    if (lock.current || (unknown && !checked)) return
    lock.current = true; setBusy(true); setMessage(null); setChecked(false)
    try { const result = await requestMatchingContact(profileId, actorId); router.push({ pathname: '/match/[id]', params: { id: result.id } }) }
    catch (reason) { setMessage(errorMessage(reason)); if (bookingOutcomeUncertain(reason)) setUnknown(true) }
    finally { lock.current = false; setBusy(false) }
  }
  async function check() {
    if (lock.current) return
    lock.current = true; setBusy(true)
    try {
      const latest = await memberGet('/squat-mates/connections', matchConnectionPageSchema, undefined, actorId)
      const found = latest.items.find(item => item.other.id === profileId)
      if (found) router.push({ pathname: '/match/[id]', params: { id: found.id } })
      else { setChecked(true); setMessage('No matching contact appears in the latest page. Review older contacts if needed. A deliberate retry requests the same member; Rentral reuses an existing active contact.') }
    } catch (reason) { setMessage(errorMessage(reason)) }
    finally { lock.current = false; setBusy(false) }
  }
  return <>{unknown ? <><Text style={styles.help}>This contact request may already exist. Check your contacts before trying again.</Text><Button title="Check latest matching contacts" secondary busy={busy} onPress={() => { void check() }} /></> : null}
    <Button title={unknown ? 'Retry this contact request' : 'Request contact'} busy={busy} disabled={unknown && !checked} onPress={() => { void request() }} />
    {message ? <Text selectable accessibilityLiveRegion="polite" style={styles.help}>{message}</Text> : null}
  </>
}
const styles = StyleSheet.create({ help: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 21 } })
