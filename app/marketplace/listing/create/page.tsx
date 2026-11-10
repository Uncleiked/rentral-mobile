import { CreateListingWizard } from '@/components/listing/CreateListingWizard'
import { getDraftForOwner } from '@/lib/listing-data'
import { requireUserId } from '@/lib/action-helpers'
import { redirect } from 'next/navigation'

export default async function CreateListingPage({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string }>
}) {
  const params = await searchParams
  const actorId = await requireUserId()
  if (!actorId) redirect('/sign-in')
  // Ownership is enforced server-side — a foreign or non-draft id resolves to
  // null and the wizard simply starts fresh.
  const draft = typeof params.draft === 'string' ? await getDraftForOwner(params.draft) : null

  return <CreateListingWizard key={`${actorId}:${params.draft ?? 'new'}`} actorId={actorId} draft={draft} />
}
