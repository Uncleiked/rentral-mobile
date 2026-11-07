import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ userId: vi.fn(), findMany: vi.fn() }));
vi.mock('@/lib/action-helpers', () => ({ requireUserId: mocks.userId }));
vi.mock('@/lib/db', () => ({ default: { listing: { findMany: mocks.findMany } } }));
vi.mock('@/lib/profile-data', () => ({ deriveListingTitle: () => 'Studio apartment' }));
import { getMediaVault } from '@/lib/vault-data';

const row = { id: 'draft-a', category: 'house', asset_metadata: { neighborhood: 'Lekki', listingTitle: 'My studio' }, text_address: '22 Private Street, Lekki', poster_path: 'owner/private/poster.jpg', document_path: null, createdAt: new Date('2026-11-06T23:30:00Z') };

beforeEach(() => { vi.resetAllMocks(); mocks.userId.mockResolvedValue('owner'); mocks.findMany.mockResolvedValue([row]); });

it('denies anonymous access before touching the database', async () => {
  mocks.userId.mockResolvedValue(null);
  expect(await getMediaVault()).toBeNull();
  expect(mocks.findMany).not.toHaveBeenCalled();
});

it('bounds the owner-scoped draft query and projects no coordinates or storage keys', async () => {
  const result = await getMediaVault();
  expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { lister_id: 'owner', listing_status: 'draft', video_path: { not: null } }, take: 101 }));
  const query = mocks.findMany.mock.calls[0][0];
  expect(query.select.hardware_coordinates).toBeUndefined();
  expect(result?.groups[0].captures[0].videoUrl).toBe('/api/listings/draft-a/source?kind=video');
  expect(JSON.stringify(result)).not.toContain('22 Private Street');
  expect(JSON.stringify(result)).not.toContain('owner/private');
});

it('keeps separate walkthroughs at the same location instead of deduplicating', async () => {
  mocks.findMany.mockResolvedValue([row, { ...row, id: 'draft-b' }]);
  const result = await getMediaVault();
  expect(result?.count).toBe(2);
  expect(result?.groups).toHaveLength(1);
  expect(result?.groups[0].captures.map((capture) => capture.id)).toEqual(['draft-a', 'draft-b']);
  expect(result?.groups[0].dateLabel).toBe('7 November 2026');
});
