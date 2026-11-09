import { z } from 'zod'
import { StyleSheet, Text, View } from 'react-native'
import { Button } from './Button'
import { Walkthrough } from './Walkthrough'
import { StatusView } from './StatusView'
import { useMemberResource } from '../hooks/use-member-resource'
import { nativeMediaUrl } from '../lib/media-url'
import { config } from '../lib/config'
import { colors, fonts, space } from '../theme'

const mediaSchema = z.object({ videoUrl: z.string().url().nullable(), posterUrl: z.string().url().nullable(), expiresAt: z.string().datetime({ offset: true }) })
export function OwnerListingMedia({ id }: { id: string }) {
  const resource = useMemberResource(`/listings/${id}/media`, mediaSchema, true, 240000)
  const uri = nativeMediaUrl(resource.data?.videoUrl ?? null, config.apiUrl)
  return <View style={styles.container}>
    {uri ? <Walkthrough key={uri} uri={uri} /> : <StatusView loading={resource.loading} title={resource.error ? 'Walkthrough unavailable' : 'No walkthrough saved'} message={resource.error ?? 'A saved recording will appear here.'} />}
    {resource.error && resource.data ? <Text accessibilityRole="alert" style={styles.help}>Could not refresh walkthrough access: {resource.error}</Text> : null}
    <Button title="Refresh walkthrough access" secondary busy={resource.refreshing} onPress={() => { void resource.refresh(true).catch(() => undefined) }} />
  </View>
}
const styles = StyleSheet.create({ container: { gap: space.lg }, help: { color: colors.warning, fontFamily: fonts.regular, fontSize: 12, lineHeight: 21 } })
