import prisma from '@/lib/db'
import { muxConfigured, muxEnabled } from './config'
import { muxClient } from './mux'
import { mediaDecision } from './policy'
import { processListingMedia, type MediaDispatchResult } from './processing'

const BATCH_SIZE = 2
const RETRY_DELAY_MS = 5 * 60 * 1000
const STALE_SUBMISSION_MS = 10 * 60 * 1000

type ReconcileResult = 'updated' | 'skipped' | 'failed'
type ProcessingJob = { id: string; mux_asset_id: string | null; updatedAt: Date }
export type MediaWorkerSummary = {
  dispatch: Record<MediaDispatchResult | 'failed', number>
  reconciliation: Record<ReconcileResult, number>
  staleSubmissions: number
  needsReview: number
}

export function mediaWorkerEnabled(): boolean {
  return process.env.MEDIA_WORKER_ENABLED === 'true' && muxEnabled() && muxConfigured()
}

async function reconcile(job: ProcessingJob): Promise<ReconcileResult> {
  if (!job.mux_asset_id) return 'skipped'
  const claimedAt = new Date()
  const claim = await prisma.mediaAsset.updateMany({
    where: { id: job.id, status: 'processing', mux_asset_id: job.mux_asset_id, updatedAt: job.updatedAt },
    data: { updatedAt: claimedAt },
  })
  if (claim.count !== 1) return 'skipped'
  const where = { id: job.id, status: 'processing', mux_asset_id: job.mux_asset_id, updatedAt: claimedAt }
  try {
    const asset = await muxClient().video.assets.retrieve(job.mux_asset_id)
    if (asset.id !== job.mux_asset_id || asset.passthrough !== job.id) {
      throw new Error('asset-binding-mismatch')
    }
    // No transaction stays open during HTTP. A webhook that changes this row
    // after our claim prevents an older provider snapshot from being applied.
    const result = await prisma.mediaAsset.updateMany({ where, data: mediaDecision(asset) })
    return result.count === 1 ? 'updated' : 'skipped'
  } catch {
    await prisma.mediaAsset.updateMany({ where, data: { error_code: 'reconciliation_unavailable' } })
    return 'failed'
  }
}

export async function runMediaWorker(): Promise<MediaWorkerSummary> {
  if (!mediaWorkerEnabled()) throw new Error('media-worker-disabled')
  const cutoff = new Date(Date.now() - RETRY_DELAY_MS)
  const summary: MediaWorkerSummary = {
    dispatch: { skipped: 0, submitted: 0, retryable: 0, uncertain: 0, failed: 0 },
    reconciliation: { updated: 0, skipped: 0, failed: 0 },
    staleSubmissions: 0,
    needsReview: 0,
  }
  const orderBy = [{ updatedAt: 'asc' as const }, { id: 'asc' as const }]
  const stale = await prisma.mediaAsset.findMany({
    where: { status: 'submitting', mux_asset_id: null, updatedAt: { lte: new Date(Date.now() - STALE_SUBMISSION_MS) } },
    select: { id: true, updatedAt: true }, orderBy, take: BATCH_SIZE,
  })
  for (const job of stale) {
    const result = await prisma.mediaAsset.updateMany({
      where: { id: job.id, status: 'submitting', mux_asset_id: null, updatedAt: job.updatedAt },
      data: { status: 'uncertain', error_code: 'submission_unknown' },
    })
    summary.staleSubmissions += result.count
  }

  const processing = await prisma.mediaAsset.findMany({
    where: { status: 'processing', mux_asset_id: { not: null }, updatedAt: { lte: cutoff } },
    select: { id: true, mux_asset_id: true, updatedAt: true }, orderBy, take: BATCH_SIZE,
  })
  const reconciled = await Promise.allSettled(processing.map(reconcile))
  for (const result of reconciled) {
    summary.reconciliation[result.status === 'fulfilled' ? result.value : 'failed'] += 1
  }

  const queued = await prisma.mediaAsset.findMany({
    where: {
      status: 'queued', attempts: { lt: 5 }, updatedAt: { lte: cutoff },
      listing: { lister: { kyc_verified: true }, listing_status: { in: ['pending_verification', 'active'] } },
    },
    select: { listing_id: true, listing: { select: { lister_id: true } } }, orderBy, take: BATCH_SIZE,
  })
  const dispatched = await Promise.allSettled(queued.map(job => processListingMedia(job.listing_id, job.listing.lister_id, cutoff)))
  for (const result of dispatched) {
    summary.dispatch[result.status === 'fulfilled' ? result.value : 'failed'] += 1
  }
  summary.needsReview = await prisma.mediaAsset.count({
    where: { OR: [{ status: { in: ['uncertain', 'errored'] } }, { status: 'queued', attempts: { gte: 5 } }] },
  })
  return summary
}
