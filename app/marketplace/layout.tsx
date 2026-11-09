import type { ReactNode } from 'react'
import { requireUserId } from '@/lib/action-helpers'
import { ApiActorScope } from '@/components/account/ApiActorScope'

export default async function MarketplaceLayout({ children }: { children: ReactNode }) {
  // Layout state persists during navigation: an old tab keeps its captured
  // restriction and cannot silently submit into a newly ambient cookie account.
  return <ApiActorScope actorId={await requireUserId()}>{children}</ApiActorScope>
}
