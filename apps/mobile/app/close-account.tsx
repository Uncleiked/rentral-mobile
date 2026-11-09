import { useCallback, useRef, useState } from 'react'
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native'
import { Host, Switch } from '@expo/ui'
import { Stack, router, useFocusEffect } from 'expo-router'
import { Page } from '../src/components/Page'
import { Button } from '../src/components/Button'
import { Field } from '../src/components/Field'
import { useAuth } from '../src/providers/AuthProvider'
import { closeNativeAccount } from '../src/lib/account-lifecycle-api'
import { bookingOutcomeUncertain } from '../src/lib/booking-api'
import { errorMessage } from '../src/lib/api'
import { colors, fonts, radius, space } from '../src/theme'

export default function CloseAccountScreen() {
  const { session, signOut } = useAuth()
  const [password, setPassword] = useState(''), [acknowledged, setAcknowledged] = useState(false), [reviewed, setReviewed] = useState(false)
  const [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [closed, setClosed] = useState(false), [message, setMessage] = useState<string | null>(null)
  const pending = useRef(false)
  useFocusEffect(useCallback(() => () => { setPassword(''); setReviewed(false) }, []))
  async function leave() { await signOut(); router.replace('/(auth)/sign-in') }
  async function close() {
    if (pending.current || !session || !reviewed || !acknowledged || !password || uncertain || closed) return
    pending.current = true; setBusy(true); setMessage(null)
    try {
      await closeNativeAccount(password, session.user.id); setPassword(''); setClosed(true)
      try { await leave() } catch (reason) { setMessage(`Your account is closed. Clearing this device’s sign-in still needs attention: ${errorMessage(reason)}`) }
    } catch (reason) { setMessage(errorMessage(reason)); if (bookingOutcomeUncertain(reason)) { setUncertain(true); setPassword('') } }
    finally { pending.current = false; setBusy(false) }
  }
  async function retrySignOut() {
    if (pending.current) return
    pending.current = true; setBusy(true)
    try { await leave() } catch (reason) { setMessage(errorMessage(reason)) }
    finally { pending.current = false; setBusy(false) }
  }
  const locked = busy || uncertain || closed
  return <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}><Stack.Screen options={{ title: 'Close account' }} /><Page title="Close your Rentral account" subtitle="Download your records and resolve open obligations first.">
    <View style={styles.card}><Text style={styles.heading}>What closure does</Text><Text style={styles.body}>Your account becomes unavailable for new activity. Listings and contacts stop appearing where the account is required to be active. Records needed for bookings, payments and reviewed reports are retained; this is not an erasure request.</Text><Text style={styles.help}>Ongoing bookings, unresolved reports and pending payments can prevent closure. The server checks current obligations before closing your account.</Text><Button title="Export my account records first" secondary disabled={busy} onPress={() => router.push('/account-export')} /></View>
    {uncertain || closed ? <View style={styles.card}><Text style={styles.heading}>{closed ? 'Account closed' : 'Closure needs confirmation'}</Text><Text style={styles.body}>{closed ? 'Server closure was confirmed. Clear the remaining sign-in on this device.' : 'The request may already have closed your account. It will not be sent again automatically. Sign out, then check whether you can still sign in.'}</Text><Button title={closed ? 'Retry clearing this device’s sign-in' : 'Sign out to check account access'} busy={busy} onPress={() => { void retrySignOut() }} /></View> : <View style={styles.card}>
      <Field label="Current password for account closure" value={password} onChangeText={value => { setPassword(value); setReviewed(false) }} secureTextEntry autoComplete="current-password" textContentType="password" autoCapitalize="none" autoCorrect={false} editable={!locked} maxLength={128} />
      <Host matchContents colorScheme="dark" seedColor={colors.accentBright}><Switch value={acknowledged} onValueChange={value => { setAcknowledged(value); setReviewed(false) }} label="I understand closure and record retention" disabled={locked} testID="account-close-acknowledgment" /></Host>
      {reviewed ? <><Text style={styles.warning}>This closes your account and revokes server sessions. Continue only after saving any records you need.</Text><Button title="Confirm and close my account" busy={busy} disabled={locked} onPress={() => { void close() }} /><Button title="Keep my account open" secondary disabled={busy} onPress={() => setReviewed(false)} /></> : <Button title="Review account closure" disabled={locked || !password || !acknowledged} onPress={() => setReviewed(true)} />}
    </View>}
    {message ? <Text selectable accessibilityRole="alert" style={styles.warning}>{message}</Text> : null}
  </Page></KeyboardAvoidingView>
}
const styles = StyleSheet.create({ keyboard: { flex: 1, backgroundColor: colors.background }, card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.xl, padding: space.xl, gap: space.lg }, heading: { color: colors.text, fontFamily: fonts.semibold, fontSize: 20 }, body: { color: colors.secondary, fontFamily: fonts.regular, fontSize: 14, lineHeight: 23 }, help: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 22 }, warning: { color: colors.warning, fontFamily: fonts.medium, fontSize: 13, lineHeight: 22 } })
