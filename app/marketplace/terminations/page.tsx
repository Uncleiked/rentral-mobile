import { LeaseRequestsPage } from '@/components/lifecycle/LeaseRequestsPage'
export default async function TerminationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <LeaseRequestsPage kind="terminations" search={await searchParams} />
}
