import prisma from '@/lib/db'
import { muxEnabled } from './config'

export type MediaSummary = { status: string; attempts: number }

export async function listingMediaStatuses(ids: string[]): Promise<Map<string, MediaSummary>> {
  if (!muxEnabled() || ids.length === 0) return new Map()
  const rows = await prisma.mediaAsset.findMany({
    where: { listing_id: { in: ids } },
    select: { listing_id: true, status: true, attempts: true },
  })
  return new Map(rows.map(row => [row.listing_id, { status: row.status, attempts: row.attempts }]))
}
