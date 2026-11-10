import { CreateListingWizard } from '@/components/listing/CreateListingWizard'
import { getDraftForOwner } from '@/lib/listing-data'
import { requireUserId } from '@/lib/action-helpers'
import { redirect } from 'next/navigation'
import prisma from '@/lib/db'
import { GalleryListingWorkspace } from '@/components/listing/GalleryListingWorkspace'

export default async function CreateListingPage({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string; gallery?: string }>
}) {
  const params = await searchParams
  const actorId = await requireUserId()
  if (!actorId) redirect('/sign-in')
  // Ownership is enforced server-side — a foreign or non-draft id resolves to
  // null and the wizard simply starts fresh.
  const [draft, account] = await Promise.all([
    typeof params.draft === 'string' ? getDraftForOwner(params.draft) : Promise.resolve(null),
    prisma.user.findUnique({ where: { id: actorId }, select: { gallery_upload_allowed: true, gallery_permission_revision: true } }),
  ])

  if (params.gallery === '1' || draft?.mediaSource === 'approved_gallery' || (!draft && account?.gallery_upload_allowed)) {
    return <GalleryListingWorkspace key={`${actorId}:${params.draft ?? 'new'}`} actorId={actorId} draft={draft}
      allowed={Boolean(account?.gallery_upload_allowed)} permissionRevision={account?.gallery_permission_revision ?? 0} />
  }

  return <CreateListingWizard key={`${actorId}:${params.draft ?? 'new'}`} actorId={actorId} draft={draft} />
}
