import { StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import { ListingCard } from './ListingCard'
import { recordSponsoredObservation, type SponsoredPlacement } from '../lib/sponsored-api'
import { useActorGuard } from '../hooks/use-actor-guard'
import { colors, fonts, space } from '../theme'

export function SponsoredListingCard({ placement }: { placement: SponsoredPlacement }) {
  const { actorId, isCurrent } = useActorGuard()
  function open() {
    if (!isCurrent(actorId)) return
    void recordSponsoredObservation(actorId, { campaignId: placement.campaignId, event: 'click' })
    router.push({ pathname: '/listing/[id]', params: { id: placement.listing.id } })
  }
  return <View style={styles.group}>
    <Text style={styles.label}>{placement.adLabel} · {placement.billingEnvironment === 'test' ? 'Test placement' : 'Live placement'}</Text>
    <Text style={styles.headline}>{placement.headline}</Text>
    <ListingCard listing={placement.listing} onOpen={open} />
  </View>
}
const styles = StyleSheet.create({ group: { gap: space.md }, label: { color: colors.accentBright, fontFamily: fonts.semibold, fontSize: 12 }, headline: { color: colors.secondary, fontFamily: fonts.medium, fontSize: 15, lineHeight: 23 } })
