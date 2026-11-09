import type { z } from 'zod'
import type { matchMessagePageSchema } from '../../../../lib/matching/contracts'
export type MatchingMessagesPage = z.infer<typeof matchMessagePageSchema>
function merge(first: MatchingMessagesPage['items'], second: MatchingMessagesPage['items']) {
  const items = new Map(first.map(item => [item.id, item]))
  for (const item of second) items.set(item.id, item)
  return [...items.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
}
export function latestMatchingWindow(previous: MatchingMessagesPage | null, next: MatchingMessagesPage) {
  if (!previous?.items.length) return { page: next, gap: false }
  const seen = new Set(previous.items.map(item => item.id)), overlap = next.items.some(item => seen.has(item.id))
  if (!overlap) return { page: next, gap: Boolean(next.nextCursor) }
  return { page: { ...next, nextCursor: previous.nextCursor, items: merge(previous.items, next.items) }, gap: false }
}
export function olderMatchingWindow(previous: MatchingMessagesPage | null, next: MatchingMessagesPage, anchor: string) {
  if (!previous || previous.items[0]?.id !== anchor) return previous
  return { ...previous, nextCursor: next.nextCursor, items: merge(next.items, previous.items) }
}
