import { useCallback, useEffect, useState } from 'react'
import { Image, Share, StyleSheet, Text, View } from 'react-native'
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router'
import { Page } from '../../src/components/Page'
import { Button } from '../../src/components/Button'
import { StatusView } from '../../src/components/StatusView'
import { Walkthrough } from '../../src/components/Walkthrough'
import { BookingRequest } from '../../src/components/BookingRequest'
import { useApiResource } from '../../src/hooks/useApiResource'
import { api, errorMessage } from '../../src/lib/api'
import { config } from '../../src/lib/config'
import { nativeMediaUrl } from '../../src/lib/media-url'
import { loadOwnActiveHold } from '../../src/lib/booking-api'
import { listingPriceLabel } from '../../src/lib/discovery-input'
import { listingObservation } from '../../src/lib/native-analytics'
import { useNativeObservation } from '../../src/hooks/use-native-observation'
import { useActorGuard } from '../../src/hooks/use-actor-guard'
import { z } from 'zod'
import type { ListingDetails } from '../../src/lib/types'
import { colors, fonts, radius, space } from '../../src/theme'

export default function ListingScreen() {
  const { actorId, isCurrent } = useActorGuard()
  const params = useLocalSearchParams<{ id: string }>()
  const id = typeof params.id === 'string' ? params.id : ''
  const listing = useApiResource<ListingDetails>(`/listings/${encodeURIComponent(id)}`)
  const media = useApiResource<{ videoUrl: string | null; posterUrl: string | null; expiresAt: string }>(`/listings/${encodeURIComponent(id)}/media`)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ownHold, setOwnHold] = useState<{ listingId: string; bookingId: string } | null>(null)
  const refreshListing = listing.refresh
  const refreshMedia = media.refresh
  useFocusEffect(useCallback(() => { refreshListing(); refreshMedia() }, [refreshListing, refreshMedia]))
  const holdUntil = listing.data?.holdUntil
  useEffect(() => {
    if (!holdUntil) return
    const controller = new AbortController()
    void loadOwnActiveHold(id, controller.signal).then(hold => {
      if (!controller.signal.aborted) setOwnHold(hold ? { listingId: id, bookingId: hold.id } : null)
    }).catch(() => { if (!controller.signal.aborted) setOwnHold(null) })
    return () => controller.abort()
  }, [id, holdUntil])
  async function message(): Promise<void> {
    if (busy || !isCurrent(actorId)) return
    setBusy(true); setError(null)
    try {
      const result = z.object({ id: z.uuid() }).strict().parse(await api<unknown>('/messages', { method: 'POST', body: { listingId: id }, expectedUserId: actorId }))
      if (isCurrent(actorId)) router.push({ pathname: '/conversation/[id]', params: { id: result.id } })
    } catch (reason) { if (isCurrent(actorId)) setError(errorMessage(reason)) }
    finally { if (isCurrent(actorId)) setBusy(false) }
  }
  async function share(): Promise<void> {
    if (!listing.data) return
    try { await Share.share({ message: `${listing.data.title} · ${listing.data.location}\n${config.apiUrl}/marketplace/listing/${id}` }) }
    catch { setError('This listing could not be shared. Please try again.') }
  }
  const value = listing.data
  useNativeObservation(value ? listingObservation(value) : null)
  const videoUrl = nativeMediaUrl(media.data?.videoUrl ?? null, config.apiUrl)
  const posterUrl = nativeMediaUrl(media.data?.posterUrl ?? null, config.apiUrl)
  const description = typeof value?.metadata.description === 'string' ? value.metadata.description.trim() : ''
  return <Page title={value?.title ?? 'Your next move'} subtitle={value?.location} refreshing={listing.loading} onRefresh={() => { listing.refresh(); media.refresh() }}>
    {listing.loading || listing.error ? <StatusView loading={listing.loading} title={listing.error ? 'Listing unavailable' : undefined} message={listing.error ?? undefined} onRetry={listing.error ? listing.refresh : undefined} /> : value ? <>
      {videoUrl ? <Walkthrough uri={videoUrl} /> : posterUrl ? <Image source={{ uri: posterUrl }} alt={value.title} style={styles.poster} /> : <StatusView loading={media.loading} message={media.error ?? 'No walkthrough available yet.'} onRetry={media.error ? media.refresh : undefined} />}
      <View style={styles.priceRow}><Text style={styles.price}>{listingPriceLabel(value.price)}<Text style={styles.period}> / {value.pricePeriod}</Text></Text><Text style={styles.intent}>{value.intent}</Text></View>
      <View style={styles.badges}>{value.badges.map(badge => <Text key={badge} style={styles.badge}>{badge}</Text>)}</View>
      {value.holdUntil ? <Text style={styles.notice}>This listing is on hold until {new Date(value.holdUntil).toLocaleString()}. You can still contact the host.</Text> : null}
      {value.holdUntil && ownHold?.listingId === id ? <Button title="View my hold" onPress={() => router.push({ pathname: '/booking/[id]', params: { id: ownHold.bookingId } })} /> : null}
      {description ? <View style={styles.section}><Text style={styles.heading}>About this listing</Text><Text style={styles.body}>{description}</Text></View> : null}
      <View style={styles.section}><Text style={styles.heading}>The details</Text>{Object.entries(value.metadata).filter(([key, item]) => item !== null && item !== '' && !['state', 'neighborhood', 'rentalIntent', 'listingTitle', 'description'].includes(key)).map(([key, item]) => <View key={key} style={styles.detail}><Text style={styles.label}>{key.replace(/([A-Z])/g, ' $1').replace(/^./, letter => letter.toUpperCase())}</Text><Text style={styles.value}>{typeof item === 'boolean' ? item ? 'Yes' : 'No' : String(item)}</Text></View>)}</View>
      <View style={styles.section}><Text style={styles.heading}>Hosted by @{value.host.username}</Text>{value.host.bio ? <Text style={styles.body}>{value.host.bio}</Text> : null}<Text style={styles.muted}>Member since {new Date(value.host.memberSince).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</Text><Button title="View host profile and reviews" secondary onPress={() => router.push({ pathname: '/profile/[username]', params: { username: value.host.username } })} /></View>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {!value.isOwner ? <Button title="Message host" secondary onPress={() => { void message() }} busy={busy} /> : <Text style={styles.muted}>This is your listing.</Text>}
      <Button title="Share listing" secondary onPress={() => { void share() }} />
      {!value.isOwner && value.status === 'active' && !value.holdUntil ? <BookingRequest listingId={id} intent={value.intent} /> : null}
    </> : null}
  </Page>
}
const styles = StyleSheet.create({
  poster: { width: '100%', aspectRatio: 4 / 3, borderRadius: radius.xl }, priceRow: { gap: space.sm }, price: { fontFamily: fonts.bold, fontSize: 29, color: colors.accentBright }, period: { fontFamily: fonts.regular, fontSize: 14, color: colors.muted }, intent: { fontFamily: fonts.medium, fontSize: 12, color: colors.muted, textTransform: 'capitalize' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }, badge: { borderRadius: radius.pill, color: colors.secondary, backgroundColor: colors.glass, paddingVertical: space.sm, paddingHorizontal: space.md, fontFamily: fonts.medium, fontSize: 12 }, notice: { color: colors.warning, fontFamily: fonts.medium, fontSize: 13, lineHeight: 22 },
  section: { gap: space.lg }, heading: { color: colors.text, fontFamily: fonts.semibold, fontSize: 20 }, detail: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: space.md, gap: space.lg }, label: { flex: 1, color: colors.muted, fontFamily: fonts.regular, fontSize: 13 }, value: { flex: 1, textAlign: 'right', color: colors.secondary, fontFamily: fonts.medium, fontSize: 13 }, body: { color: colors.secondary, fontFamily: fonts.regular, fontSize: 14, lineHeight: 22 }, muted: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 20 }, error: { color: colors.warning, fontFamily: fonts.medium, fontSize: 13, lineHeight: 22 },
})
