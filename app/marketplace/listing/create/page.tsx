import { CreateListingWizard } from '@/components/listing/CreateListingWizard'
import { getDraftForOwner } from '@/lib/listing-data'

export default async function CreateListingPage({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string }>
}) {
  const params = await searchParams
  // Ownership is enforced server-side — a foreign or non-draft id resolves to
  // null and the wizard simply starts fresh.
  const draft = typeof params.draft === 'string' ? await getDraftForOwner(params.draft) : null

  return <CreateListingWizard draft={draft} />
}
