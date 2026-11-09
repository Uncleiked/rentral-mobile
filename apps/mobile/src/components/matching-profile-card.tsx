import type { ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import type { PublicMatchProfile, MatchCandidate } from '../../../../lib/matching/contracts'
import { MATCH_AREA_LABELS } from '../../../../lib/matching/policy'
import { MemberAvatar } from './member-avatar'
import { memberAmount } from '../lib/member-format'
import { colors, fonts, radius, space } from '../theme'

export function MatchingProfileCard({ profile, overlap, children }: { profile: PublicMatchProfile; overlap?: MatchCandidate['overlap']; children?: ReactNode }) {
  const name = profile.username ? `@${profile.username}` : 'Rentral member'
  return <View style={styles.card}><View style={styles.row}><MemberAvatar url={profile.avatarUrl} name={name} size="small" /><Text style={styles.heading}>{name}</Text></View>
    {profile.bio ? <Text selectable style={styles.body}>{profile.bio}</Text> : null}
    <Text style={styles.body}>{profile.neighborhoods.map(area => MATCH_AREA_LABELS[area]).join(', ')}</Text><Text selectable style={styles.body}>{memberAmount(profile.monthlyMinKobo)}–{memberAmount(profile.monthlyMaxKobo)} per month</Text>
    <Text style={styles.help}>Smoking: {profile.smoking.replaceAll('_', ' ')} · Pets: {profile.pets.replaceAll('_', ' ')} · Guests: {profile.guests} · Quiet hours: {profile.quietHours}</Text>
    {overlap ? <><Text style={styles.score}>Stated preference overlap: {overlap.score}%</Text>{overlap.reasons.map(reason => <Text key={reason} style={styles.help}>{reason}</Text>)}<Text style={styles.help}>This compares stated preferences. It does not predict trust, safety or whether living together will work.</Text></> : null}
    {children}
  </View>
}
const styles = StyleSheet.create({ card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.xl, padding: space.xl, gap: space.lg }, row: { flexDirection: 'row', alignItems: 'center', gap: space.md }, heading: { flex: 1, color: colors.text, fontFamily: fonts.semibold, fontSize: 18 }, body: { color: colors.secondary, fontFamily: fonts.regular, fontSize: 14, lineHeight: 23 }, help: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 21 }, score: { color: colors.accentBright, fontFamily: fonts.semibold, fontSize: 14 } })
