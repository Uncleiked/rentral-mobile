import { useRef, useState } from 'react'
import { Image, StyleSheet, Text, View } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { Button } from './Button'
import { MemberAvatar } from './member-avatar'
import { prepareAvatar, uploadPreparedAvatar, type PreparedAvatar } from '../lib/avatar-upload'
import { saveMemberProfile } from '../lib/member-api'
import type { MemberProfile } from '../lib/member-contracts'
import { ApiError, errorMessage } from '../lib/api'
import { colors, fonts, radius, space } from '../theme'

type Props = { profile: MemberProfile; disabled: boolean; onBusyChange: (busy: boolean) => void; onSaved: (profile: MemberProfile) => void }

export function AvatarEditor({ profile, disabled, onBusyChange, onSaved }: Props) {
  const [selected, setSelected] = useState<PreparedAvatar | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const pending = useRef(false)
  const uploaded = useRef<{ avatar: PreparedAvatar; path: string } | null>(null)
  function begin(): boolean {
    if (pending.current || disabled) return false
    pending.current = true; setBusy(true); onBusyChange(true); setMessage(null); setFailed(false)
    return true
  }
  function finish(): void { pending.current = false; setBusy(false); onBusyChange(false) }
  async function choose(): Promise<void> {
    if (!begin()) return
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.9, exif: false })
      if (result.canceled) return
      const prepared = await prepareAvatar(result.assets[0].uri)
      setSelected(prepared); uploaded.current = null
    } catch { setFailed(true); setMessage('This photo could not be selected or prepared. Allow photo access in device settings or choose another image.') }
    finally { finish() }
  }
  async function save(): Promise<void> {
    if (!selected || !begin()) return
    try {
      let path = uploaded.current?.avatar === selected ? uploaded.current.path : null
      if (!path) { path = await uploadPreparedAvatar(selected); uploaded.current = { avatar: selected, path } }
      const updated = await saveMemberProfile({ avatarUrl: path })
      if (updated.id !== profile.id || updated.avatarUrl !== path) throw new ApiError('Your photo update could not be confirmed. Refresh your account before continuing.', 'INVALID_RESPONSE', 200)
      onSaved(updated); setSelected(null); uploaded.current = null; setMessage('Your profile photo is saved.')
    } catch (reason) { setFailed(true); setMessage(errorMessage(reason)) }
    finally { finish() }
  }
  async function remove(): Promise<void> {
    if (!begin()) return
    try {
      const updated = await saveMemberProfile({ avatarUrl: null })
      if (updated.id !== profile.id || updated.avatarUrl !== null) throw new ApiError('Your photo removal could not be confirmed. Refresh your account before continuing.', 'INVALID_RESPONSE', 200)
      onSaved(updated); setSelected(null); uploaded.current = null; setMessage('Your profile photo is removed.')
    } catch (reason) { setFailed(true); setMessage(errorMessage(reason)) }
    finally { finish() }
  }
  return <View style={styles.photo}>
    {selected ? <Image source={{ uri: selected.uri }} alt="Selected profile photo preview" accessibilityLabel="Selected profile photo preview" style={styles.preview} /> : <MemberAvatar url={profile.avatarUrl} name={profile.username ?? 'Rentral member'} />}
    <Text style={styles.help}>Choose a photo. Rentral prepares a small JPEG before uploading; your profile changes only when the server confirms the save.</Text>
    <Button title={selected ? 'Choose a different photo' : 'Choose profile photo'} secondary busy={busy} disabled={disabled} onPress={() => { void choose() }} />
    {selected ? <><Button title="Save photo" disabled={busy || disabled} onPress={() => { void save() }} /><Button title="Discard selected photo" secondary disabled={busy || disabled} onPress={() => { setSelected(null); uploaded.current = null; setMessage(null) }} /></> : profile.avatarUrl ? <Button title="Remove photo" secondary disabled={busy || disabled} onPress={() => { void remove() }} /> : null}
    {message ? <Text selectable accessibilityLiveRegion="polite" style={[styles.help, failed && styles.error]}>{message}</Text> : null}
  </View>
}
const styles = StyleSheet.create({ photo: { gap: space.lg }, preview: { width: 88, height: 88, borderRadius: radius.pill }, help: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 21 }, error: { color: colors.warning } })
