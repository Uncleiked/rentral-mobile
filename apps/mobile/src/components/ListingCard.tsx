import { useState } from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { router } from 'expo-router'
import type { Listing } from '../lib/types'
import { api, errorMessage } from '../lib/api'
import { useApiResource } from '../hooks/useApiResource'
import { nativeMediaUrl } from '../lib/media-url'
import { config } from '../lib/config'
import { colors, fonts, radius, space } from '../theme'

type Props = { listing: Listing; onSaved?: () => void }
export function ListingCard({ listing, onSaved }: Props) {
  const media = useApiResource<{ posterUrl: string | null }>(`/listings/${listing.id}/media`)
  const poster = nativeMediaUrl(media.data?.posterUrl ?? null, config.apiUrl)
  const [localSaved, setLocalSaved] = useState<{ listing: Listing; value: boolean } | null>(null)
  const saved = localSaved?.listing === listing ? localSaved.value : listing.saved
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function toggleSave(): Promise<void> {
    if (busy) return
    setBusy(true); setError(null)
    try { const result = await api<{ saved: boolean }>(`/saved/${listing.id}`, { method: saved ? 'DELETE' : 'PUT' }); setLocalSaved({ listing, value: result.saved }); onSaved?.() }
    catch (reason) { setError(errorMessage(reason)) }
    finally { setBusy(false) }
  }
  return <View style={styles.card}><Pressable accessibilityRole="button" accessibilityLabel={`View ${listing.title} in ${listing.location}`} onPress={() => router.push({ pathname: '/listing/[id]', params: { id: listing.id } })} style={({ pressed }) => [styles.link, pressed && styles.pressed]}>
    <View style={styles.image}>{poster ? <Image source={{ uri: poster }} alt="" style={styles.posterImage} resizeMode="cover" /> : <Ionicons name={listing.category === 'house' ? 'home-outline' : listing.category === 'car' ? 'car-sport-outline' : 'boat-outline'} color={colors.muted} size={48} />}
      <View style={styles.category}><Text style={styles.tag}>{listing.category === 'house' ? 'Home' : listing.category === 'car' ? 'Car' : 'Boat'} · {listing.intent}</Text></View>
      {listing.holdUntil ? <View style={styles.hold}><Text style={styles.tag}>On hold</Text></View> : null}
    </View>
    <View style={styles.copy}><Text numberOfLines={1} style={styles.title}>{listing.title}</Text><View style={styles.location}><Ionicons name="location-outline" color={colors.muted} size={13} /><Text style={styles.muted}>{listing.location}</Text></View>
      <View style={styles.badges}>{listing.badges.map(badge => <Text key={badge} style={styles.badge}>{badge}</Text>)}</View>
      <View style={styles.priceRow}><Text style={styles.price}>{listing.price}<Text style={styles.period}> / {listing.pricePeriod}</Text></Text><Text style={styles.host} numberOfLines={1}>@{listing.host.username}</Text></View>
    </View>
  </Pressable>
    {listing.savingAvailable ? <Pressable accessibilityRole="button" accessibilityLabel={saved ? 'Remove from saved' : 'Save listing'} accessibilityState={{ selected: saved, disabled: busy }} disabled={busy} onPress={() => { void toggleSave() }} style={styles.save}><Ionicons name={saved ? 'heart' : 'heart-outline'} color={saved ? colors.accentBright : colors.text} size={22} /></Pressable> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
  </View>
}
const styles = StyleSheet.create({
  posterImage: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }, link: { overflow: 'hidden' }, pressed: { opacity: 0.85 }, image: { height: 230, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.glass },
  category: { position: 'absolute', top: space.lg, left: space.lg, backgroundColor: colors.overlay, paddingVertical: space.sm, paddingHorizontal: space.md, borderRadius: radius.pill }, tag: { color: colors.text, fontFamily: fonts.medium, fontSize: 11 }, hold: { position: 'absolute', bottom: space.lg, left: space.lg, borderRadius: radius.pill, backgroundColor: colors.accent, padding: space.sm },
  copy: { padding: space.lg, gap: space.md }, title: { color: colors.text, fontFamily: fonts.semibold, fontSize: 19 }, location: { flexDirection: 'row', alignItems: 'center', gap: space.xs }, muted: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12 }, badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }, badge: { color: colors.secondary, fontFamily: fonts.medium, fontSize: 11, backgroundColor: colors.glass, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: space.xs }, priceRow: { gap: space.sm }, price: { color: colors.accentBright, fontFamily: fonts.bold, fontSize: 21 }, period: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12 }, host: { color: colors.muted, fontFamily: fonts.regular, fontSize: 11 },
  save: { position: 'absolute', right: space.lg, top: space.lg, borderRadius: radius.pill, backgroundColor: colors.overlay, width: 44, height: 44, justifyContent: 'center', alignItems: 'center' }, error: { padding: space.lg, color: colors.warning, fontFamily: fonts.medium, fontSize: 12, lineHeight: 19 },
})
