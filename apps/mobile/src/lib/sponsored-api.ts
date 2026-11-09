import { z } from 'zod'
import { sponsoredPageSchema } from '../../../../lib/commerce/contracts'
import { discoveryApiPath, type DiscoveryFilters } from './discovery-input'
import { api } from './api'
import { memberResponse } from './member-api'
import { nativeAnalytics } from './native-analytics'

export { sponsoredPageSchema }
export type SponsoredPlacement = z.infer<typeof sponsoredPageSchema>['items'][number]
const eventSchema = z.object({ campaignId: z.uuid(), event: z.enum(['impression', 'click']) }).strict()
const recordedSchema = z.object({ recorded: z.boolean() }).strict()
export const sponsoredApiPath = (filters: DiscoveryFilters) => discoveryApiPath(filters).replace(/^\/listings(?=\?|$)/, '/sponsored')

/** First-party measurement is optional and cannot delay opening the public listing. */
export function recordSponsoredObservation(actorId: string, input: unknown): Promise<boolean> {
  const parsed = eventSchema.safeParse(input)
  if (!parsed.success || !actorId) return Promise.resolve(false)
  const { campaignId, event } = parsed.data
  return nativeAnalytics.recordConsented(actorId, `placement:${campaignId}:${event}`, async () => memberResponse(recordedSchema,
    await api<unknown>(`/sponsored/${campaignId}/events`, { method: 'POST', body: { event }, expectedUserId: actorId })).recorded)
}
