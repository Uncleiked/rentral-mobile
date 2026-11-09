import { useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Field } from './Field'
import { Button } from './Button'
import { AvatarEditor } from './avatar-editor'
import { saveMemberProfile } from '../lib/member-api'
import type { MemberProfile } from '../lib/member-contracts'
import { ApiError, errorMessage } from '../lib/api'
import { memberDate } from '../lib/member-format'
import { colors, fonts, radius, space } from '../theme'

type Props = { profile: MemberProfile; onSaved: (profile: MemberProfile) => void }

export function ProfileEditor({ profile, onSaved }: Props) {
  const [form, setForm] = useState({ base: profile, username: profile.username ?? '', bio: profile.bio ?? '' })
  const [busy, setBusy] = useState(false)
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const saving = useRef(false)
  const edited = form.username.trim().toLowerCase() !== (form.base.username ?? '') || form.bio.trim() !== (form.base.bio ?? '')
  const username = edited ? form.username : profile.username ?? ''
  const bio = edited ? form.bio : profile.bio ?? ''
  const normalizedUsername = username.trim().toLowerCase()
  const changed = normalizedUsername !== (profile.username ?? '') || bio.trim() !== (profile.bio ?? '')
  function edit(field: 'username' | 'bio', value: string): void {
    setForm({ base: profile, username, bio, [field]: value }); setMessage(null)
  }
  async function save(): Promise<void> {
    if (saving.current || avatarBusy) return
    if (normalizedUsername !== (profile.username ?? '') && !/^[a-z0-9_]{3,24}$/.test(normalizedUsername)) {
      setFailed(true); setMessage('Use 3–24 lowercase letters, numbers or underscores for your username.'); return
    }
    saving.current = true; setBusy(true); setFailed(false); setMessage(null)
    try {
      const updated = await saveMemberProfile({ ...(normalizedUsername !== (profile.username ?? '') ? { username: normalizedUsername } : {}),
        ...(bio.trim() !== (profile.bio ?? '') ? { bio: bio.trim() || null } : {}) })
      if (updated.id !== profile.id) throw new ApiError('Your profile update could not be confirmed. Refresh before continuing.', 'INVALID_RESPONSE', 200)
      onSaved(updated); setForm({ base: updated, username: updated.username ?? '', bio: updated.bio ?? '' }); setMessage('Your profile is saved.')
    } catch (reason) { setFailed(true); setMessage(errorMessage(reason)) }
    finally { saving.current = false; setBusy(false) }
  }
  return <>
    <View style={styles.identity}><Text style={styles.name}>{profile.username ? `@${profile.username}` : 'Rentral member'}</Text><Text style={styles.help}>Member since {memberDate(profile.memberSince)}</Text></View>
    <View style={styles.form}><Text style={styles.heading}>Profile photo</Text><AvatarEditor profile={profile} disabled={busy} onBusyChange={setAvatarBusy} onSaved={onSaved} /></View>
    <View style={styles.form}><Text style={styles.heading}>Make it yours</Text><Text style={styles.help}>Your public username and bio are optional profile details.</Text>
      <Field label="Username" value={username} onChangeText={value => edit('username', value.toLowerCase())} autoCapitalize="none" autoCorrect={false} maxLength={24} editable={!busy && !avatarBusy} textContentType="username" />
      <Field label="Bio" value={bio} onChangeText={value => edit('bio', value)} multiline maxLength={280} editable={!busy && !avatarBusy} placeholder="A few words about you" />
      <Text style={styles.count}>{bio.length}/280</Text><Button title="Save profile" busy={busy} disabled={!changed || avatarBusy} onPress={() => { void save() }} />
      {message ? <Text selectable accessibilityLiveRegion="polite" style={[styles.feedback, failed && styles.error]}>{message}</Text> : null}
    </View>
    <View style={styles.form}><Text style={styles.heading}>Account</Text><Text style={styles.help}>Email</Text><Text selectable style={styles.email}>{profile.email}</Text></View>
  </>
}
const styles = StyleSheet.create({ identity: { gap: space.sm }, name: { color: colors.text, fontFamily: fonts.semibold, fontSize: 23 },
  form: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, padding: space.xl, gap: space.lg },
  heading: { color: colors.text, fontFamily: fonts.semibold, fontSize: 19 }, help: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 21 },
  count: { color: colors.muted, fontFamily: fonts.regular, fontSize: 11, textAlign: 'right' }, feedback: { color: colors.accentBright, fontFamily: fonts.medium, fontSize: 13, lineHeight: 22 },
  error: { color: colors.warning }, email: { color: colors.secondary, fontFamily: fonts.medium, fontSize: 14 } })
