'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { Check } from 'lucide-react'
import { markNotificationAction } from '@/app/actions/notificationActions'

type Props = { id: string; title: string; body: string; href: string | null; read: boolean; date: string }
export function NotificationItem({ id, title, body, href, read, date }: Props) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  return <article className={`rounded-2xl border p-5 ${read ? 'border-border-subtle bg-surface-card' : 'border-glass-border-success bg-accent-muted'}`}>
    <div className="flex items-start justify-between gap-4"><div><h2 className="font-semibold">{title}</h2><p className="mt-2 text-sm text-text-secondary">{body}</p><time className="mt-3 block text-xs text-text-muted" dateTime={date}>{new Date(date).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}</time></div>{!read && <button type="button" aria-label={`Mark ${title} as read`} disabled={pending} className="rounded-full p-2 hover:bg-glass-light" onClick={() => startTransition(async () => { try { const result = await markNotificationAction(id); if (!result.success) setError(result.error) } catch { setError('Please try again.') } })}><Check className="size-5" /></button>}</div>
    {href?.startsWith('/marketplace/') && <Link href={href} className="mt-4 inline-block text-sm font-semibold text-accent-hover">View details →</Link>}{error && <p role="alert" className="mt-2 text-xs text-trust-flagged">{error}</p>}
  </article>
}
