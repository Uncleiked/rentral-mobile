import type { NativeMessage, NativeThread } from './messaging-api'

function merge(older: NativeMessage[], newer: NativeMessage[]): NativeMessage[] {
  const messages = new Map(older.map(message => [message.id, message]))
  for (const message of newer) messages.set(message.id, message)
  return [...messages.values()].sort((a, b) => a.sentAt.localeCompare(b.sentAt) || a.id.localeCompare(b.id))
}
export function mergeLatestThread(previous: NativeThread | null, next: NativeThread): { thread: NativeThread; gap: boolean } {
  if (!previous || previous.id !== next.id || previous.userId !== next.userId || previous.messages.length === 0) return { thread: next, gap: false }
  const existing = new Set(previous.messages.map(message => message.id))
  const overlap = next.messages.some(message => existing.has(message.id))
  if (!overlap) return { thread: next, gap: next.hasMore }
  return { thread: { ...next, hasMore: previous.hasMore, messages: merge(previous.messages, next.messages) }, gap: false }
}
/** Older results attach only to the same contiguous window from which they were requested. */
export function mergeOlderThread(previous: NativeThread | null, older: NativeThread, anchor: string): NativeThread | null {
  if (!previous || previous.id !== older.id || previous.userId !== older.userId || previous.messages[0]?.id !== anchor) return previous
  return { ...previous, hasMore: older.hasMore, messages: merge(older.messages, previous.messages) }
}
