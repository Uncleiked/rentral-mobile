import prisma from '@/lib/db';
import { requireUserId } from '@/lib/action-helpers';
import { LISTING_STATUS } from '@/lib/listing-status';
import { listingMediaUrl } from '@/lib/storage';
import { deriveListingTitle, type ListingMetadataJson } from '@/lib/profile-data';
import { vaultNeighborhood, vaultSavedDate } from '@/lib/vault-policy';

export type VaultCapture = { id: string; title: string; category: string; videoUrl: string; posterUrl: string | null; savedAt: string; savedLabel: string; hasDocument: boolean };
export type VaultGroup = { key: string; area: string; dateLabel: string; captures: VaultCapture[] };

function metadataObject(value: unknown): ListingMetadataJson {
  const metadata: ListingMetadataJson = {};
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    for (const [key, entry] of Object.entries(value)) {
      if (typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean' || entry === null) metadata[key] = entry;
    }
  }
  return metadata;
}

export async function getMediaVault(): Promise<{ groups: VaultGroup[]; count: number; limited: boolean } | null> {
  const userId = await requireUserId();
  if (!userId) return null;
  const rows = await prisma.listing.findMany({
    where: { lister_id: userId, listing_status: LISTING_STATUS.DRAFT, video_path: { not: null } },
    select: { id: true, category: true, asset_metadata: true, text_address: true, poster_path: true, document_path: true, createdAt: true },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 101,
  });
  const groups = new Map<string, VaultGroup>();
  for (const row of rows.slice(0, 100)) {
    const metadata = metadataObject(row.asset_metadata);
    const area = vaultNeighborhood(row.text_address, metadata.neighborhood);
    const dateLabel = vaultSavedDate(row.createdAt);
    const key = `${area}:${dateLabel}`;
    const group = groups.get(key) ?? { key, area, dateLabel, captures: [] };
    group.captures.push({
      id: row.id,
      title: typeof metadata.listingTitle === 'string' && metadata.listingTitle.trim() ? metadata.listingTitle : deriveListingTitle(row.category, metadata),
      category: row.category === 'house' ? 'Home' : row.category === 'car' ? 'Car' : 'Boat',
      videoUrl: listingMediaUrl(row.id, 'video'),
      posterUrl: row.poster_path ? listingMediaUrl(row.id, 'poster') : null,
      savedAt: row.createdAt.toISOString(),
      savedLabel: new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' }).format(row.createdAt),
      hasDocument: row.document_path !== null,
    });
    // Every saved row is retained, even if its address/location matches another.
    groups.set(key, group);
  }
  return { groups: [...groups.values()], count: Math.min(rows.length, 100), limited: rows.length > 100 };
}
