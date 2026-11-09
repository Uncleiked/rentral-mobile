import { LeaseRequestsPage } from '@/components/lifecycle/LeaseRequestsPage'
export default async function RenewalsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <LeaseRequestsPage kind="renewals" search={await searchParams} />
}
