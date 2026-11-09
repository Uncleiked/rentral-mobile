import { useState } from 'react'
import { Image, StyleSheet, Text, View } from 'react-native'
import { config } from '../lib/config'
import { memberAvatarUrl } from '../lib/member-contracts'
import { colors, fonts, radius } from '../theme'

export function MemberAvatar({ url, name, size = 'large' }: { url: string | null; name: string; size?: 'small' | 'large' }) {
  const uri = memberAvatarUrl(url, config.apiUrl)
  const [failed, setFailed] = useState<string | null>(null)
  return <View style={[styles.avatar, size === 'small' ? styles.small : styles.large]}>
    {uri && failed !== uri ? <Image source={{ uri }} alt={`${name} profile photo`} accessibilityLabel={`${name} profile photo`} style={styles.photo} onError={() => setFailed(uri)} />
      : <Text style={[styles.initial, size === 'small' && styles.smallInitial]}>{name.charAt(0).toUpperCase() || 'R'}</Text>}
  </View>
}
const styles = StyleSheet.create({ avatar: { borderRadius: radius.pill, backgroundColor: colors.accentMuted, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  small: { width: 44, height: 44 }, large: { width: 88, height: 88 }, photo: { width: '100%', height: '100%' }, initial: { fontFamily: fonts.semibold, fontSize: 32, color: colors.accentBright }, smallInitial: { fontSize: 18 } })
