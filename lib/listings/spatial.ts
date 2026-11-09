import { createHash } from 'node:crypto'
import { z } from 'zod'
import prisma from '@/lib/db'
import type { Prisma } from '@prisma/client'
import { lockRecord, withTransaction } from '@/lib/database/transactions'
import { fetchBoundedProviderJson } from '@/lib/providers/bounded-json'

export const SPATIAL_TOLERANCE_METERS = 100
// WGS84 latitude/longitude, evaluated on the IUGG mean-radius sphere. This is
// a bounded local proximity test, not an ellipsoidal survey or proof of presence.
const EARTH_MEAN_RADIUS_METERS = 6371008.8
export type GeographicPoint = { longitude: number; latitude: number }
const geographicPoint = z.object({ longitude: z.number().min(-180).max(180), latitude: z.number().min(-90).max(90) })
const storedPoint = z.object({ type: z.literal('Point'), coordinates: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]) }).strict()

export function distanceMetersWgs84(from: GeographicPoint, to: GeographicPoint): number {
  geographicPoint.parse(from); geographicPoint.parse(to)
  const radians = Math.PI / 180
  const latitudeDelta = (to.latitude - from.latitude) * radians
  const longitudeDelta = (to.longitude - from.longitude) * radians
  const halfChord = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(from.latitude * radians) * Math.cos(to.latitude * radians) * Math.sin(longitudeDelta / 2) ** 2
  return 2 * EARTH_MEAN_RADIUS_METERS * Math.asin(Math.sqrt(Math.min(1, Math.max(0, halfChord))))
}

function decodePoint(value: unknown): GeographicPoint | null {
  const parsed = storedPoint.safeParse(value)
  return parsed.success ? { longitude: parsed.data.coordinates[0], latitude: parsed.data.coordinates[1] } : null
}

export async function listingProximity(tx: Prisma.TransactionClient, listingId: string, longitude: number, latitude: number, maxMeters: number): Promise<boolean> {
  const caller = geographicPoint.safeParse({ longitude, latitude })
  if (!caller.success || !Number.isFinite(maxMeters) || maxMeters < 0) return false
  const location = await tx.listingLocation.findUnique({ where: { listing_id: listingId }, select: { geometry: true } })
  const recorded = decodePoint(location?.geometry)
  return recorded !== null && distanceMetersWgs84(recorded, caller.data) <= maxMeters
}
export function addressFingerprint(address: string): string {
  return createHash('sha256').update(address.trim().toLowerCase().replace(/\s+/g, ' ')).digest('hex')
}

const geocodeResponse = z.object({ features: z.array(z.object({
  geometry: z.object({ coordinates: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]) }),
  properties: z.object({ result_type: z.string().max(100), country_code: z.string().length(2).optional(), rank: z.object({ confidence: z.number().min(0).max(1) }) }),
})).max(1) })

export async function verifyListingAddress(listingId: string): Promise<'matched' | 'mismatch' | 'unavailable'> {
  const listing = await prisma.listing.findUniqueOrThrow({ where: { id: listingId }, select: { text_address: true } })
  if (!listing.text_address) return 'unavailable'
  const hash = addressFingerprint(listing.text_address)
  const key = process.env.GEOAPIFY_API_KEY
  if (!key) return 'unavailable'
  const url = new URL('https://api.geoapify.com/v1/geocode/search')
  url.searchParams.set('text', listing.text_address)
  url.searchParams.set('filter', 'countrycode:ng')
  url.searchParams.set('limit', '1')
  url.searchParams.set('apiKey', key)
  let result: z.infer<typeof geocodeResponse>['features'][number] | undefined
  try { result = geocodeResponse.parse(await fetchBoundedProviderJson(url, { headers: { Accept: 'application/json' } }, { maximumBytes: 64 * 1024, timeoutMs: 10000 })).features[0] }
  catch { throw new Error('GEOCODER_UNAVAILABLE') }
  // A city/district centroid cannot verify an individual asset address.
  if (!result || (result.properties.country_code && result.properties.country_code.toLowerCase() !== 'ng') || result.properties.rank.confidence < 0.8 || !['building', 'amenity'].includes(result.properties.result_type)) return 'unavailable'
  const [longitude, latitude] = result.geometry.coordinates
  return withTransaction(async tx => {
    if (!await lockRecord(tx, 'listing', listingId)) return 'unavailable'
    const current = await tx.listing.findUnique({ where: { id: listingId }, select: { text_address: true } })
    // A delayed geocoder response cannot approve an address edited meanwhile.
    if (!current?.text_address || addressFingerprint(current.text_address) !== hash) return 'unavailable'
    const location = await tx.listingLocation.findUnique({ where: { listing_id: listingId }, select: { geometry: true } })
    const recorded = decodePoint(location?.geometry)
    const distance = recorded ? distanceMetersWgs84(recorded, { longitude, latitude }) : null
    const status = distance === null ? 'unavailable' : distance <= SPATIAL_TOLERANCE_METERS ? 'matched' : 'mismatch'
    await tx.listingVerification.upsert({ where: { listing_id: listingId },
      create: { listing_id: listingId, address_hash: hash, spatial_status: status, distance_meters: distance },
      update: { address_hash: hash, spatial_status: status, distance_meters: distance, checked_at: new Date() } })
    return status
  })
}
