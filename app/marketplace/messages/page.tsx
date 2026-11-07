import Link from 'next/link'
import { redirect } from 'next/navigation'
import { MessageCircle, ArrowLeft } from 'lucide-react'
import { z } from 'zod'
import { requireUserId } from '@/lib/action-helpers'
import { platformEnabled } from '@/lib/platform'
import { getInbox, getThread } from '@/lib/messaging/service'
import { MarketplaceShell } from '@/components/layout/MarketplaceShell'
import { ChatPanel } from '@/components/messaging/ChatPanel'
import { MessageStarter } from '@/components/messaging/MessageStarter'

type Props = { searchParams: Promise<{ id?: string; listing?: string }> }

export default async function MessagesPage({ searchParams }: Props) {
  const userId = await requireUserId()
  if (!userId) redirect('/sign-in')
  const params = await searchParams
  const id = z.uuid().safeParse(params.id)
  const listing = z.uuid().safeParse(params.listing)
  const [inbox, thread] = await Promise.all([getInbox(userId), id.success ? getThread(userId, id.data) : Promise.resolve(null)])
  return <MarketplaceShell>
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="mb-6 flex items-center justify-between"><div><p className="text-xs uppercase tracking-widest text-accent-hover">Stay connected</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Inbox</h1></div><Link href="/marketplace" className="text-xs text-text-muted">Back to explore</Link></div>
      {!platformEnabled() ? <div className="rounded-2xl border border-border-subtle bg-surface-card p-10 text-center"><MessageCircle className="mx-auto mb-4 size-10 text-accent-primary" /><h2 className="text-xl font-semibold">Your conversations, together.</h2><p className="mx-auto mt-3 max-w-sm text-sm text-text-muted">Messaging will open when the marketplace is ready. You’ll be able to contact hosts and keep each rental conversation in one place.</p><Link href="/marketplace" className="mt-6 inline-flex rounded-xl bg-accent-primary px-5 py-3 text-sm font-semibold text-text-inverse">Explore listings</Link></div> :
      <div className="flex items-start gap-5">
        <aside aria-label="Conversations" className={`w-full shrink-0 space-y-2 md:w-72 ${thread ? 'hidden md:block' : ''}`}>
          {inbox.map(item => <Link key={item.id} href={`/marketplace/messages?id=${item.id}`} aria-current={item.id === thread?.id ? 'page' : undefined} className={`block rounded-2xl border p-4 ${item.id === thread?.id ? 'border-accent-primary bg-accent-muted' : 'border-border-subtle bg-surface-card'}`}><p className="font-semibold">{(item.seeker_id === userId ? item.lister.username : item.seeker.username) ?? 'Rentral member'}</p><p className="mt-1 truncate text-sm text-text-muted">{item.messages[0]?.body || 'Start the conversation'}</p></Link>)}
          {!inbox.length && <p className="rounded-2xl border border-border-subtle p-5 text-sm text-text-muted">No conversations yet. Open a listing to message its host.</p>}
        </aside>
        <div className={`min-w-0 flex-1 ${!thread && !listing.success ? 'hidden md:block' : ''}`}>
          {thread ? <><Link href="/marketplace/messages" className="mb-3 inline-flex items-center gap-2 text-sm text-text-muted md:hidden"><ArrowLeft className="size-4" /> All conversations</Link><ChatPanel key={thread.id} initialThread={thread} realtimeEnabled={process.env.RENTRAL_REALTIME_ENABLED === 'true'} /></> : listing.success ? <MessageStarter listingId={listing.data} /> : <div className="flex min-h-80 flex-col items-center justify-center rounded-2xl border border-border-subtle p-8 text-center"><MessageCircle className="mb-4 size-10 text-accent-primary" /><h2 className="text-xl font-semibold">Make your next move.</h2><p className="mt-2 text-sm text-text-muted">Choose a conversation or discover a listing you love.</p></div>}
        </div>
      </div>}
    </div>
  </MarketplaceShell>
}
