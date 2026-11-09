import { useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Field } from './Field'
import { Button } from './Button'
import { api, errorMessage } from '../lib/api'
import type { Profile } from '../lib/types'
import { memberDate } from '../lib/member-format'
import { colors, fonts, radius, space } from '../theme'

type Props = { profile: Profile }

export function ProfileEditor({ profile }: Props) {
  const [saved, setSaved] = useState(profile)
  const [username, setUsername] = useState(profile.username ?? '')
  const [bio, setBio] = useState(profile.bio ?? '')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const saving = useRef(false)
  const normalizedUsername = username.trim().toLowerCase()
  const changed = normalizedUsername !== (saved.username ?? '') || bio.trim() !== (saved.bio ?? '')

  async function save(): Promise<void> {
    if (saving.current) return
    if (!/^[a-z0-9_]{3,24}$/.test(normalizedUsername)) {
      setFailed(true); setMessage('Use 3–24 lowercase letters, numbers or underscores for your username.'); return
    }
    saving.current = true; setBusy(true); setFailed(false); setMessage(null)
    try {
      const updated = await api<Profile>('/me', { method: 'PATCH', body: { username: normalizedUsername, bio: bio.trim() || null } })
      setSaved(updated); setUsername(updated.username ?? ''); setBio(updated.bio ?? ''); setMessage('Your profile is saved.')
    } catch (error) { setFailed(true); setMessage(errorMessage(error)) }
    finally { saving.current = false; setBusy(false) }
  }

  return <>
    <View style={styles.identity}><View style={styles.avatar}><Ionicons name="person-outline" size={30} color={colors.accentBright} /></View>
      <View style={styles.identityText}><Text style={styles.name}>{saved.username ? `@${saved.username}` : 'Rentral member'}</Text><Text style={styles.muted}>Member since {memberDate(saved.memberSince)}</Text></View>
    </View>
    <View style={styles.form}>
      <Text style={styles.heading}>Make it yours</Text><Text style={styles.help}>Add a public username and a little about yourself.</Text>
      <Field label="Username" value={username} onChangeText={value => { setUsername(value.toLowerCase()); setMessage(null) }} autoCapitalize="none" autoCorrect={false} maxLength={24} editable={!busy} textContentType="username" />
      <Field label="Bio" value={bio} onChangeText={value => { setBio(value); setMessage(null) }} multiline maxLength={280} editable={!busy} placeholder="A few words about you" />
      <Text style={styles.count}>{bio.length}/280</Text>
      <Button title="Save profile" busy={busy} disabled={!changed} onPress={() => { void save() }} />
      {message ? <Text accessibilityLiveRegion="polite" style={[styles.feedback, failed && styles.error]}>{message}</Text> : null}
    </View>
    <View style={styles.account}><Text style={styles.heading}>Account</Text><Text style={styles.muted}>Email</Text><Text style={styles.email} selectable>{profile.email}</Text></View>
  </>
}

const styles = StyleSheet.create({
  identity: { flexDirection: 'row', alignItems: 'center', gap: space.lg }, avatar: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentMuted, borderRadius: radius.pill }, identityText: { flex: 1, gap: space.sm },
  name: { color: colors.text, fontFamily: fonts.semibold, fontSize: 20 }, muted: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 20 },
  form: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.xl, padding: space.xl, gap: space.lg },
  heading: { color: colors.text, fontFamily: fonts.semibold, fontSize: 17 }, help: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 21 },
  count: { color: colors.muted, fontFamily: fonts.regular, fontSize: 11, textAlign: 'right', marginTop: -space.sm },
  feedback: { color: colors.accentBright, fontFamily: fonts.medium, fontSize: 13, lineHeight: 21 }, error: { color: colors.warning },
  account: { gap: space.sm }, email: { color: colors.secondary, fontFamily: fonts.regular, fontSize: 14, lineHeight: 22 },
})
