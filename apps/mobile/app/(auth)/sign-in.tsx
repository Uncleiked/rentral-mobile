import { useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View, Image, Linking } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { config, configurationError } from '../../src/lib/config'
import { useSignIn } from '../../src/hooks/useSignIn'
import { Page } from '../../src/components/Page'
import { Field } from '../../src/components/Field'
import { Button } from '../../src/components/Button'
import { colors, fonts, radius, space } from '../../src/theme'
import heroHome from '../../assets/hero-home.jpg'

export default function SignIn() {
  const auth = useSignIn()
  const [visible, setVisible] = useState(false)
  const [linkError, setLinkError] = useState<string | null>(null)
  const newPassword = auth.mode === 'signup' || auth.mode === 'reset'
  function openPolicy(path: string): void {
    if (config.apiUrl) void Linking.openURL(`${config.apiUrl}/${path}`).catch(() => setLinkError('Could not open this page. Please try again.'))
  }
  return <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}><Page title="rentral." subtitle="Homes. Cars. Boats. One place.">
    <View style={styles.hero}><Image source={heroHome} alt="" style={styles.heroImage} resizeMode="cover" /><View style={styles.scrim} />
      <View style={styles.heroCopy}><Text style={styles.eyebrow}>MADE FOR YOUR NEXT MOVE</Text><Text style={styles.headline}>A place to stay.{'\n'}A way to go.</Text><View style={styles.location}><Ionicons name="location-outline" size={14} color={colors.text} /><Text style={styles.locationText}>Starting in Lagos</Text></View></View>
    </View>
    <View style={styles.form}><Text accessibilityRole="header" style={styles.title}>{auth.mode === 'login' ? 'Welcome back' : auth.mode === 'signup' ? 'Make yourself at home' : 'Reset your password'}</Text>
      <Text style={styles.body}>{auth.mode === 'signup' ? 'Create your account and start exploring.' : auth.mode === 'recover' ? 'Request a code to reset your password.' : auth.mode === 'reset' ? 'Paste your reset code and choose a new password.' : 'Sign in to find your next home, car or boat.'}</Text>
      {auth.mode !== 'reset' ? <Field label="Email address" value={auth.email} onChangeText={auth.setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" textContentType="emailAddress" placeholder="you@example.com" editable={!auth.busy} /> : <Field label="Reset code" value={auth.resetToken} onChangeText={auth.setResetToken} autoCapitalize="none" autoCorrect={false} editable={!auth.busy} placeholder="Paste the complete reset code" />}
      {auth.mode !== 'recover' ? <View style={styles.password}><Field label={newPassword ? 'New password' : 'Password'} value={auth.password} onChangeText={auth.setPassword} secureTextEntry={!visible} autoCapitalize="none" autoCorrect={false} textContentType={newPassword ? 'newPassword' : 'password'} autoComplete={newPassword ? 'new-password' : 'current-password'} placeholder={newPassword ? 'At least 8 characters' : 'Your password'} maxLength={128} editable={!auth.busy} onSubmitEditing={() => { void auth.submit() }} />
        <Pressable accessibilityRole="button" accessibilityLabel={visible ? 'Hide password' : 'Show password'} hitSlop={8} onPress={() => setVisible(value => !value)} style={styles.reveal}><Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={21} color={colors.muted} /></Pressable></View> : null}
      {(auth.error || linkError) ? <Text accessibilityRole="alert" style={styles.error}>{auth.error || linkError}</Text> : null}
      {auth.notice ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{auth.notice}</Text> : null}
      <Button title={auth.mode === 'login' ? 'Sign in' : auth.mode === 'signup' ? 'Create account' : auth.mode === 'reset' ? 'Save new password' : 'Send reset code'} onPress={() => { void auth.submit() }} busy={auth.busy} disabled={Boolean(configurationError)} />
      {auth.mode === 'login' ? <Pressable accessibilityRole="button" onPress={() => auth.changeMode('recover')} disabled={auth.busy} style={styles.textButton}><Text style={styles.link}>Forgot password?</Text></Pressable> : null}
      {auth.mode === 'recover' ? <Button title="Use reset code" secondary disabled={auth.busy} onPress={() => auth.changeMode('reset')} /> : null}
      <Pressable accessibilityRole="button" disabled={auth.busy} onPress={() => auth.changeMode(auth.mode === 'login' ? 'signup' : 'login')} style={styles.textButton}><Text style={styles.body}>{auth.mode === 'login' ? 'New to Rentral? ' : 'Already have an account? '}<Text style={styles.link}>{auth.mode === 'login' ? 'Create account' : 'Sign in'}</Text></Text></Pressable>
      <Text style={styles.legal}>By continuing, you agree to our <Text accessibilityRole="link" style={styles.link} onPress={() => openPolicy('terms')}>Terms</Text> and <Text accessibilityRole="link" style={styles.link} onPress={() => openPolicy('privacy')}>Privacy Policy</Text>.</Text>
    </View>
  </Page></KeyboardAvoidingView>
}
const styles = StyleSheet.create({
  heroImage: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  flex: { flex: 1, backgroundColor: colors.background }, hero: { height: 225, borderRadius: radius.xl, overflow: 'hidden', justifyContent: 'flex-end' }, scrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.overlay }, heroCopy: { padding: space.xl, gap: space.md },
  eyebrow: { fontFamily: fonts.semibold, color: colors.secondary, fontSize: 9, letterSpacing: 2 }, headline: { color: colors.text, fontSize: 31, fontFamily: fonts.semibold, lineHeight: 38, letterSpacing: -1 }, location: { flexDirection: 'row', alignItems: 'center', gap: space.xs }, locationText: { color: colors.secondary, fontFamily: fonts.medium, fontSize: 12 },
  form: { gap: space.lg }, title: { color: colors.text, fontFamily: fonts.semibold, fontSize: 25, letterSpacing: -0.6 }, body: { color: colors.muted, fontFamily: fonts.regular, fontSize: 14, lineHeight: 22 }, password: { position: 'relative' }, reveal: { position: 'absolute', right: space.lg, bottom: 15 },
  error: { color: colors.warning, fontFamily: fonts.medium, fontSize: 13, lineHeight: 21 }, notice: { color: colors.accentBright, fontFamily: fonts.medium, fontSize: 13, lineHeight: 21 }, link: { color: colors.accentBright, fontFamily: fonts.semibold }, textButton: { alignItems: 'center', padding: space.sm, minHeight: 44, justifyContent: 'center' }, divider: { flexDirection: 'row', alignItems: 'center', gap: space.md }, line: { flex: 1, height: 1, backgroundColor: colors.border }, muted: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12 }, providerRow: { flexDirection: 'row', gap: space.md }, legal: { color: colors.muted, fontFamily: fonts.regular, fontSize: 11, lineHeight: 18, textAlign: 'center' },
})
