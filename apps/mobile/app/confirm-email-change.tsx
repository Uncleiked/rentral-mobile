import { useCallback, useRef, useState } from 'react'
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native'
import { Stack, router, useFocusEffect } from 'expo-router'
import { Page } from '../src/components/Page'
import { Button } from '../src/components/Button'
import { Field } from '../src/components/Field'
import { useAuth } from '../src/providers/AuthProvider'
import { confirmAccountEmailChange } from '../src/lib/security-api'
import { errorMessage } from '../src/lib/api'
import { colors, fonts, radius, space } from '../src/theme'

export default function ConfirmEmailChangeScreen() {
  const { session, signOut } = useAuth()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [mustSignOut, setMustSignOut] = useState(false)
  const pending = useRef(false)
  useFocusEffect(useCallback(() => () => { setCode('') }, []))
  async function leave(): Promise<void> {
    if (pending.current) return
    pending.current = true; setBusy(true)
    try { await signOut(); router.replace('/(auth)/sign-in') }
    catch (failure) { setMessage(`Your email change is complete, but local sign-out needs attention: ${errorMessage(failure)}`) }
    finally { pending.current = false; setBusy(false) }
  }
  async function confirm(): Promise<void> {
    if (pending.current || !/^[A-Za-z0-9_-]{43}$/.test(code.trim())) return
    pending.current = true; setBusy(true); setMessage(null)
    try {
      const result = await confirmAccountEmailChange(code.trim())
      setCode('')
      if (result.signInRequired) {
        setMustSignOut(true); setMessage('Both addresses are confirmed. Sign in again with your new email address.')
        try { await signOut(); router.replace('/(auth)/sign-in') }
        catch (failure) { setMessage(`Both addresses are confirmed, but local sign-out needs attention: ${errorMessage(failure)}`) }
      } else setMessage('This address is confirmed. Enter the separate code sent to the other address to complete the change.')
    } catch (failure) { setMessage(errorMessage(failure)) }
    finally { pending.current = false; setBusy(false) }
  }
  return <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS==='ios'?'padding':'height'}>
    <Stack.Screen options={{ title:'Confirm email change',headerShown:true }} />
    <Page title="Confirm your email change" subtitle="The current and proposed email addresses must each be confirmed.">
      <View style={styles.card}><Text style={styles.help}>Enter the one-use confirmation code delivered to either address. Codes stay out of browser history and device storage. Confirming only one address leaves the change pending.</Text>
        {!mustSignOut ? <><Field label="Email-change confirmation code" value={code} onChangeText={value => setCode(value.replace(/\s/g,''))} autoCapitalize="none" autoCorrect={false} autoComplete="off" textContentType="oneTimeCode" secureTextEntry maxLength={128} editable={!busy} /><Button title="Confirm email-change code" busy={busy} disabled={!/^[A-Za-z0-9_-]{43}$/.test(code.trim())} onPress={() => { void confirm() }} /></> : <Button title="Clear local sign-in and continue" busy={busy} onPress={() => { void leave() }} />}
        {message ? <Text selectable accessibilityLiveRegion="polite" style={styles.notice}>{message}</Text> : null}
      </View>
      <Button title={session?'Return to account security':'Return to sign in'} secondary disabled={busy} onPress={() => { if (session) router.dismissTo('/settings'); else router.replace('/(auth)/sign-in') }} />
    </Page>
  </KeyboardAvoidingView>
}
const styles=StyleSheet.create({keyboard:{flex:1,backgroundColor:colors.background},card:{backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:radius.xl,padding:space.xl,gap:space.lg},help:{color:colors.muted,fontFamily:fonts.regular,fontSize:13,lineHeight:22},notice:{color:colors.warning,fontFamily:fonts.medium,fontSize:13,lineHeight:22}})
