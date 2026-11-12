'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { MessageCircle } from 'lucide-react'
import { startConversationAction } from '@/app/actions/messageActions'

export function MessageStarter({ listingId }: { listingId: string }) {
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  return <div className="rounded-2xl border border-border-subtle bg-surface-card p-6 min-w-0 max-w-full wrap-anywhere text-text-primary">
    <MessageCircle className="mb-4 size-8 text-accent-primary" />
    <h2 className="text-xl font-semibold break-words">A conversation starts here.</h2>
    <p className="mt-2 text-sm text-text-muted">Ask the host about the asset, availability, or an inspection. Keep payments on Rentral.</p>
    <button type="button" disabled={pending} className="mt-6 rounded-xl bg-accent-primary px-5 py-3 font-semibold text-text-inverse disabled:opacity-50 min-h-11 max-w-full whitespace-normal break-words"
      onClick={() => startTransition(async () => {
        try {
          const result = await startConversationAction(listingId)
          if (result.success) router.push(`/marketplace/messages?id=${result.data}`)
          else setError(result.error)
        } catch { setError('Could not connect. Please try again.') }
      })}>{pending ? 'Opening conversation…' : 'Message the host'}</button>
    {error && <p role="alert" className="mt-3 text-sm text-trust-flagged">{error}</p>}
  </div>
}
