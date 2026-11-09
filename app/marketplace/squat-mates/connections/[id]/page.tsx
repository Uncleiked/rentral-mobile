import { notFound, redirect } from 'next/navigation'
import { z } from 'zod'
import { requireUserId } from '@/lib/action-helpers'
import { MarketplaceShell } from '@/components/layout/MarketplaceShell'
import { MatchingConversation } from '@/components/matching/MatchingConversation'

export default async function MatchingConversationPage({ params }: { params: Promise<{ id: string }> }) {
  if (!await requireUserId()) redirect('/sign-in')
  const id = z.uuid().safeParse((await params).id)
  if (!id.success) notFound()
  return <MarketplaceShell><div className="mx-auto w-full max-w-3xl space-y-7 px-4 py-8 sm:px-6 sm:py-12"><MatchingConversation id={id.data} /></div></MarketplaceShell>
}
