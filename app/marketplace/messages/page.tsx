import Link from 'next/link'
import { redirect } from 'next/navigation'
import { MessageCircle } from 'lucide-react'
import { z } from 'zod'
import { requireUserId } from '@/lib/action-helpers'
import { platformEnabled } from '@/lib/platform'
import { MarketplaceShell } from '@/components/layout/MarketplaceShell'
import { MessagesWorkspace } from '@/components/messaging/MessagesWorkspace'
type Props = { searchParams: Promise<{ id?: string; listing?: string; user?: string; folder?: string }> }
export default async function MessagesPage({ searchParams }: Props) {
  const actorId = await requireUserId()
  if (!actorId) redirect('/sign-in')
  const params = await searchParams
  const id = z.uuid().safeParse(params.id), listing = z.uuid().safeParse(params.listing), user = z.uuid().safeParse(params.user)
  const folder = z.enum(['primary', 'requests', 'sent']).catch('primary').parse(params.folder)
  return <MarketplaceShell><div className="mx-auto w-full min-w-0 max-w-6xl">{platformEnabled() ? <MessagesWorkspace key={[id.success ? id.data : '', listing.success ? listing.data : '', user.success ? user.data : '', folder].join(':')} actorId={actorId} threadId={id.success ? id.data : undefined} listingId={listing.success ? listing.data : undefined} recipientId={user.success ? user.data : undefined} initialFolder={folder} /> : <section className="rounded-2xl border border-border-subtle bg-surface-card p-8 text-center text-text-primary"><MessageCircle className="mx-auto mb-4 size-10 text-accent-primary" /><h1 className="text-xl font-semibold">Your conversations, together.</h1><p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-text-muted">Messaging will open when the marketplace is ready. Contact hosts and keep rental conversations in one place.</p><Link href="/marketplace" className="mt-6 inline-flex min-h-11 rounded-xl bg-accent-primary px-5 py-3 text-sm font-semibold text-text-inverse">Explore listings</Link></section>}</div></MarketplaceShell>
}
