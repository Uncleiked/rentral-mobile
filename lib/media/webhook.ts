import type { Asset } from '@mux/mux-node/resources/video/assets'
import { withTransaction, lockRecord } from '@/lib/database/transactions'
import { mediaDecision } from './policy'

export async function applyMediaEvent(eventId: string, asset: Pick<Asset, 'id' | 'passthrough' | 'status' | 'duration' | 'playback_ids' | 'tracks' | 'upload_id'>): Promise<void> {
  if (!asset.passthrough) return
  const decision = mediaDecision(asset)
  await withTransaction(async tx => {
    if (!await lockRecord(tx, 'mediaAsset', asset.passthrough!)) return
    const row = await tx.mediaAsset.findUnique({ where: { id: asset.passthrough! }, select: { id: true, status: true, mux_asset_id: true, mux_upload_id: true, error_code: true } })
    if (!row || row.status === 'queued' || (row.mux_asset_id && row.mux_asset_id !== asset.id)) return
    if ((row.mux_upload_id && asset.upload_id !== row.mux_upload_id) || row.error_code === 'submission_binding_conflict') return
    const receipt = await tx.mediaWebhookReceipt.findUnique({ where: { event_id: eventId }, select: { event_id: true } })
    if (receipt) return
    await tx.mediaWebhookReceipt.create({ data: { event_id: eventId, media_id: row.id } })
    // Concurrent fetches can still finish out of order. Terminal state cannot
    // regress to processing, even when the earlier HTTP response arrives last.
    if (['ready', 'errored'].includes(row.status) && decision.status === 'processing') return
    await tx.mediaAsset.update({ where: { id: row.id }, data: { ...decision, mux_asset_id: asset.id } })
  })
}
