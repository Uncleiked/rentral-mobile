import type { Asset } from '@mux/mux-node/resources/video/assets'
import prisma from '@/lib/db'
import { mediaDecision } from './policy'

export async function applyMediaEvent(eventId: string, asset: Pick<Asset, 'id' | 'passthrough' | 'status' | 'duration' | 'playback_ids' | 'tracks'>): Promise<void> {
  if (!asset.passthrough) return
  const decision = mediaDecision(asset)
  await prisma.$transaction(async tx => {
    const rows = await tx.$queryRaw<{ id: string; status: string; mux_asset_id: string | null }[]>`
      SELECT "id", "status", "mux_asset_id" FROM "MediaAsset"
      WHERE "id" = ${asset.passthrough} FOR UPDATE
    `
    const row = rows[0]
    if (!row || row.status === 'queued' || (row.mux_asset_id && row.mux_asset_id !== asset.id)) return
    const receipt = await tx.mediaWebhookReceipt.createMany({
      data: [{ event_id: eventId, media_id: row.id }], skipDuplicates: true,
    })
    if (receipt.count === 0) return
    // Concurrent fetches can still finish out of order. Terminal state cannot
    // regress to processing, even when the earlier HTTP response arrives last.
    if (['ready', 'errored'].includes(row.status) && decision.status === 'processing') return
    await tx.mediaAsset.update({ where: { id: row.id }, data: { ...decision, mux_asset_id: asset.id } })
  })
}
