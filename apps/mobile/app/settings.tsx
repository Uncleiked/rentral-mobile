import { useCallback, useRef, useState } from 'react'
import { FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Stack, router, useFocusEffect } from 'expo-router'
import { accountSecuritySchema, accountSessionsSchema, type AccountSessions } from '../../../lib/contracts/account-security'
import { Button } from '../src/components/Button'
import { Field } from '../src/components/Field'
import { StatusView } from '../src/components/StatusView'
import { useAuth } from '../src/providers/AuthProvider'
import { useMemberPages, useMemberResource } from '../src/hooks/use-member-resource'
import { cancelAccountEmailChange, changeAccountPassword, requestAccountEmailChange, revokeAccountSession, revokeAllAccountSessions } from '../src/lib/security-api'
import { bookingOutcomeUncertain } from '../src/lib/booking-api'
import { errorMessage } from '../src/lib/api'
import { colors, fonts, radius, space } from '../src/theme'

const sessionsPageSchema = accountSessionsSchema.transform(page => ({ ...page, limit: 50 }))
type SessionRow = AccountSessions['items'][number]
export default function SettingsScreen() {
  const { session, signOut } = useAuth()
  const account = useMemberResource('/auth/account', accountSecuritySchema)
  const sessions = useMemberPages('/auth/sessions', sessionsPageSchema)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [repeatPassword, setRepeatPassword] = useState('')
  const [emailPassword, setEmailPassword] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [messageScope, setMessageScope] = useState<'password'|'email'|'sessions'|'general'>('general')
  const [emailUnknown, setEmailUnknown] = useState(false)
  const [passwordUnknown, setPasswordUnknown] = useState(false)
  const [sessionsUnknown, setSessionsUnknown] = useState(false)
  const [mustSignOut, setMustSignOut] = useState(false)
  const [revoked, setRevoked] = useState<Record<string, true>>({})
  const pending = useRef(false)
  useFocusEffect(useCallback(() => () => { setCurrentPassword(''); setNewPassword(''); setRepeatPassword(''); setEmailPassword('') }, []))
  const disabled = busy !== null || mustSignOut
  function begin(name: string): boolean { if (pending.current || !session) return false; pending.current = true; setBusy(name); setMessage(null); setMessageScope(name==='password'?'password':name.toLowerCase().includes('email')||name==='refreshAccount'?'email':name==='signout'?'general':'sessions'); return true }
  function finish(): void { pending.current = false; setBusy(null) }
  async function clearSignIn(): Promise<void> {
    await signOut()
    router.replace('/(auth)/sign-in')
  }
  async function signOutAgain(): Promise<void> {
    if (!begin('signout')) return
    try { await clearSignIn() } catch (failure) { setMessage(`Local sign-out still needs attention: ${errorMessage(failure)}`) }
    finally { finish() }
  }
  async function password(): Promise<void> {
    if (newPassword !== repeatPassword) { setMessageScope('password'); setMessage('The new passwords do not match.'); return }
    if (!begin('password') || !session) return
    try {
      await changeAccountPassword({ currentPassword, newPassword }, session.user.id)
      setCurrentPassword(''); setNewPassword(''); setRepeatPassword(''); setMustSignOut(true)
      try { await clearSignIn() } catch (failure) { setMessage(`Your password changed and server sessions were revoked. Local sign-out needs attention: ${errorMessage(failure)}`) }
    } catch (failure) { setMessage(errorMessage(failure)); if (bookingOutcomeUncertain(failure)) setPasswordUnknown(true) }
    finally { finish() }
  }
  async function email(): Promise<void> {
    if (!begin('email') || !session || !account.data) return
    try {
      const result = await requestAccountEmailChange({ newEmail, currentPassword: emailPassword }, session.user.id)
      account.replace({ ...account.data, emailChange: result.pending, delivery: result.delivery }); setEmailPassword('')
      setMessage(result.delivery === 'email' ? 'Separate confirmation codes were sent to the current and proposed addresses. Both must be confirmed.' : 'Development delivery is enabled. Ask your backend operator for the separate confirmation codes for the current and proposed addresses.')
    } catch (failure) { setMessage(errorMessage(failure)); if (bookingOutcomeUncertain(failure)) setEmailUnknown(true) }
    finally { finish() }
  }
  async function cancelEmail(): Promise<void> {
    if (!begin('cancelEmail') || !session || !account.data) return
    try { await cancelAccountEmailChange(session.user.id); account.replace({ ...account.data, emailChange: null }); setMessage('The pending email change is cancelled. Your current email address remains in use.') }
    catch (failure) { setMessage(errorMessage(failure)); if (bookingOutcomeUncertain(failure)) setEmailUnknown(true) }
    finally { finish() }
  }
  async function refreshAccount(): Promise<void> {
    if (!begin('refreshAccount')) return
    try { await account.refresh(true); setEmailUnknown(false); setMessage('Your latest account and email-change status is shown. No email request was repeated.') }
    catch (failure) { setMessage(errorMessage(failure)) }
    finally { finish() }
  }
  async function revoke(item?: SessionRow): Promise<void> {
    if (!begin(item?.id ?? 'allSessions') || !session) return
    try {
      const result = item ? await revokeAccountSession(item.id, item.current, session.user.id) : await revokeAllAccountSessions(session.user.id)
      if (result.current || result.signInRequired) {
        setMustSignOut(true)
        try { await clearSignIn() } catch (failure) { setMessage(`Server revocation is confirmed. Local sign-out needs attention: ${errorMessage(failure)}`) }
      } else if (item) {
        setRevoked(previous => ({ ...previous, [item.id]: true })); setMessage('This session’s revocation is confirmed.')
        void sessions.refresh().catch(() => undefined)
      }
    } catch (failure) { setMessage(errorMessage(failure)); if (bookingOutcomeUncertain(failure)) setSessionsUnknown(true) }
    finally { finish() }
  }
  async function refreshSessions(): Promise<void> {
    if (!begin('refreshSessions')) return
    try { await sessions.refresh(true); setSessionsUnknown(false); setMessage('Your latest sessions are shown. No revocation request was repeated.') }
    catch (failure) { setMessage(errorMessage(failure)) }
    finally { finish() }
  }
  return <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}><SafeAreaView style={styles.safe} edges={['bottom','left','right']}>
    <Stack.Screen options={{ title:'Account security',headerShown:true }} />
    <FlatList data={sessions.items} keyExtractor={item=>item.id} keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}
      refreshing={sessions.refreshing} onRefresh={()=>{void refreshSessions()}}
      ListHeaderComponent={<View style={styles.header}><Text accessibilityRole="header" style={styles.title}>Account security</Text><Text style={styles.help}>Manage sign-in details and server sessions. Passwords and confirmation codes are never saved on this device.</Text>
        {message&&messageScope==='general'?<Text selectable accessibilityLiveRegion="polite" style={styles.warning}>{message}</Text>:null}
        {mustSignOut?<Button title="Clear local sign-in and continue" busy={busy==='signout'} onPress={()=>{void signOutAgain()}}/>:null}
        {passwordUnknown?<View style={styles.card}><Text style={styles.heading}>Check your password change</Text><Text style={styles.help}>The change may have reached Rentral. Keep your proposed password, sign out and check sign-in before attempting another change. The request was not automatically repeated.</Text><Button title="Sign out to check password" secondary disabled={busy!==null} onPress={()=>{void signOutAgain()}}/></View>:null}
        <View style={styles.card}><Text style={styles.heading}>Change password</Text><Text style={styles.help}>Use 8–128 characters. A confirmed change revokes all server sessions and requires signing in again.</Text>
          <Field label="Current password" value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="current-password" textContentType="password" maxLength={128} editable={!disabled&&!passwordUnknown}/>
          <Field label="New password" value={newPassword} onChangeText={setNewPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="new-password" textContentType="newPassword" maxLength={128} editable={!disabled&&!passwordUnknown}/>
          <Field label="Repeat new password" value={repeatPassword} onChangeText={setRepeatPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="new-password" textContentType="newPassword" maxLength={128} editable={!disabled&&!passwordUnknown}/>
          <Button title="Change password and sign out" busy={busy==='password'} disabled={disabled||passwordUnknown||!currentPassword||newPassword.length<8||newPassword!==repeatPassword} onPress={()=>{void password()}}/>
          {message&&messageScope==='password'?<Text selectable accessibilityLiveRegion="polite" style={styles.warning}>{message}</Text>:null}
        </View>
        {account.loading?<StatusView loading message="Loading account confirmation settings…"/>:!account.data?<StatusView title="Account settings unavailable" message={account.error??'Reload your account settings.'} onRetry={()=>{void refreshAccount()}}/>:<View style={styles.card}><Text style={styles.heading}>Email address</Text><Text selectable style={styles.body}>{account.data.email}</Text>
          {account.data.emailChange?<><Text selectable style={styles.body}>Proposed address: {account.data.emailChange.newEmail}</Text><Text style={styles.help}>Current address: {account.data.emailChange.oldConfirmed?'Confirmed':'Awaiting code'}{ '\n' }Proposed address: {account.data.emailChange.newConfirmed?'Confirmed':'Awaiting code'}{ '\n' }Expires {new Date(account.data.emailChange.expiresAt).toLocaleString()}</Text><Button title="Cancel pending email change" secondary busy={busy==='cancelEmail'} disabled={disabled||emailUnknown} onPress={()=>{void cancelEmail()}}/></>:<>
            <Field label="New email address" value={newEmail} onChangeText={setNewEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" textContentType="emailAddress" maxLength={254} editable={!disabled&&!emailUnknown}/>
            <Field label="Current password for email change" value={emailPassword} onChangeText={setEmailPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="current-password" textContentType="password" maxLength={128} editable={!disabled&&!emailUnknown}/>
            <Button title="Request email change" busy={busy==='email'} disabled={disabled||emailUnknown||account.data.delivery==='unavailable'||!emailPassword||!newEmail.trim()} onPress={()=>{void email()}}/>
          </>}
          <Text style={styles.help}>{account.data.delivery==='unavailable'?'Confirmation delivery is unavailable on this server. A new email change cannot be requested.':account.data.delivery==='development-outbox'?'Development delivery uses a private operator outbox. Ask your backend operator for confirmation codes.':'Separate one-use codes are delivered to both addresses. Confirming both changes the email and revokes all sessions.'}</Text>
          <Button title="Confirm an email-change code" secondary disabled={busy!==null} onPress={()=>router.push('/confirm-email-change')}/><Button title="Refresh account status" secondary disabled={busy!==null} onPress={()=>{void refreshAccount()}}/>
          {emailUnknown?<Text style={styles.warning}>This email change or cancellation may already be recorded. Refresh account status before trying again.</Text>:null}
          {account.error?<Text style={styles.warning}>Could not refresh: {account.error}</Text>:null}
          {message&&messageScope==='email'?<Text selectable accessibilityLiveRegion="polite" style={styles.warning}>{message}</Text>:null}
        </View>}
        <View style={styles.card}><Text style={styles.heading}>Your records and account</Text><Button title="Export my account records" secondary disabled={busy!==null} onPress={()=>router.push('/account-export')}/><Button title="Review account closure" secondary disabled={busy!==null} onPress={()=>router.push('/close-account')}/></View>
        <Text accessibilityRole="header" style={styles.heading}>Active server sessions</Text><Text style={styles.help}>Dates identify sessions without collecting device names or exact locations. Revoking a session prevents further API use with its credentials.</Text>
        <Button title="Sign out all server sessions" secondary busy={busy==='allSessions'} disabled={disabled||sessionsUnknown} onPress={()=>{void revoke()}}/><Button title="Refresh server sessions" secondary disabled={busy!==null} onPress={()=>{void refreshSessions()}}/>
        {sessionsUnknown?<Text style={styles.warning}>A revocation may already have completed. Refresh sessions before repeating a request.</Text>:null}{sessions.error&&sessions.data?<Text style={styles.warning}>Could not refresh: {sessions.error}</Text>:null}
        {message&&messageScope==='sessions'?<Text selectable accessibilityLiveRegion="polite" style={styles.warning}>{message}</Text>:null}
      </View>}
      ListEmptyComponent={sessions.loading?<StatusView loading message="Loading active sessions…"/>:sessions.error?<StatusView title="Sessions unavailable" message={sessions.error} onRetry={()=>{void refreshSessions()}}/>:<Text style={styles.help}>No active sessions to display.</Text>}
      renderItem={({item})=><View style={styles.card}><Text style={styles.heading}>{item.current?'Current session':'Another server session'}{revoked[item.id]?' · Revocation confirmed':''}</Text><Text selectable style={styles.help}>Started {new Date(item.createdAt).toLocaleString()}{ '\n' }Expires {new Date(item.expiresAt).toLocaleString()}</Text><Button title={item.current?'Revoke current session':'Revoke this session'} secondary busy={busy===item.id} disabled={disabled||sessionsUnknown||Boolean(revoked[item.id])} onPress={()=>{void revoke(item)}}/></View>}
      ListFooterComponent={<View style={styles.header}>{sessions.moreError?<Text style={styles.warning}>{sessions.moreError}</Text>:null}{sessions.hasMore?<Button title="Older server sessions" secondary busy={sessions.loadingMore} disabled={busy!==null} onPress={()=>{void sessions.loadMore()}}/>:null}</View>}/>
  </SafeAreaView></KeyboardAvoidingView>
}
const styles=StyleSheet.create({keyboard:{flex:1,backgroundColor:colors.background},safe:{flex:1},content:{width:'100%',maxWidth:760,alignSelf:'center',padding:space.xl,paddingBottom:space.xxl,gap:space.lg},header:{gap:space.lg},title:{color:colors.text,fontFamily:fonts.bold,fontSize:30},card:{backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:radius.xl,padding:space.xl,gap:space.lg},heading:{color:colors.text,fontFamily:fonts.semibold,fontSize:20},body:{color:colors.secondary,fontFamily:fonts.regular,fontSize:14,lineHeight:23},help:{color:colors.muted,fontFamily:fonts.regular,fontSize:13,lineHeight:22},warning:{color:colors.warning,fontFamily:fonts.medium,fontSize:13,lineHeight:22}})
