import { createHash } from 'node:crypto'
import { z } from 'zod'
import prisma from '@/lib/db'

export const SPATIAL_TOLERANCE_METERS = 100
export function addressFingerprint(address: string): string {
  return createHash('sha256').update(address.trim().toLowerCase().replace(/\s+/g, ' ')).digest('hex')
}

const geocodeResponse = z.object({ features: z.array(z.object({
  geometry: z.object({ coordinates: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]) }),
  properties: z.object({ result_type: z.string(), rank: z.object({ confidence: z.number().min(0).max(1) }) }),
})) })

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
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(10000) })
  if (!response.ok) throw new Error('GEOCODER_UNAVAILABLE')
  const result = geocodeResponse.parse(await response.json()).features[0]
  // A city/district centroid cannot verify an individual asset address.
  if (!result || result.properties.rank.confidence < 0.8 || !['building', 'amenity'].includes(result.properties.result_type)) return 'unavailable'
  const [longitude, latitude] = result.geometry.coordinates
  const rows = await prisma.$queryRaw<{ distance: number | null }[]>`
    SELECT extensions.ST_Distance(hardware_coordinates,
      extensions.ST_SetSRID(extensions.ST_MakePoint(${longitude},${latitude}),4326)::extensions.geography) AS distance
    FROM "Listing" WHERE id=${listingId} AND text_address=${listing.text_address}
  `
  const distance = rows[0]?.distance
  const status = typeof distance === 'number' && Number.isFinite(distance)
    ? distance <= SPATIAL_TOLERANCE_METERS ? 'matched' : 'mismatch' : 'unavailable'
  await prisma.listingVerification.upsert({ where: { listing_id: listingId },
    create: { listing_id: listingId, address_hash: hash, spatial_status: status, distance_meters: distance },
    update: { address_hash: hash, spatial_status: status, distance_meters: distance, checked_at: new Date() } })
  return status
}
