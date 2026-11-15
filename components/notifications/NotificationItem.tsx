'use client'
import Link from 'next/link'
import { useState } from 'react'
import { Bell, CalendarDays, Check, Heart, LoaderCircle, MessageCircle, UserPlus } from 'lucide-react'
import { notificationReadSchema } from '@/lib/contracts/notifications'
import { socialError, socialRequest } from '@/lib/social/client'
type Props = { id: string; title: string; body: string; href: string | null; read: boolean; date: string; kind: string; actorId: string; onRead: (id: string, readAt: string) => void }
export function NotificationItem({ id, title, body, href, read, date, kind, actorId, onRead }: Props) {
  const [pending, setPending] = useState(false), [error, setError] = useState('')
  const Icon = kind === 'social_follow' ? UserPlus : kind === 'social_like' ? Heart : kind.includes('message') ? MessageCircle : kind.includes('booking') ? CalendarDays : Bell
  async function markRead() {
    if (pending) return
    setPending(true); setError('')
    try { const receipt = await socialRequest('/api/v1/notifications/' + id + '/read', notificationReadSchema, {}, actorId, 'PATCH'); onRead(receipt.id, receipt.readAt) }
    catch (reason) { setError(socialError(reason)) }
    finally { setPending(false) }
  }
  return <article className={'min-w-0 rounded-2xl border p-4 sm:p-5 ' + (read ? 'border-border-subtle bg-surface-card' : 'border-glass-border-success bg-accent-muted')}><div className="flex min-w-0 items-start gap-3"><span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-border-subtle text-accent-hover"><Icon className="size-5" aria-hidden="true" /></span><div className="min-w-0 flex-1"><h2 className="break-words text-sm font-semibold sm:text-base">{title}</h2><p className="mt-2 break-words text-sm leading-6 text-text-secondary">{body}</p><time className="mt-3 block text-xs text-text-muted" dateTime={date}>{new Date(date).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</time>{href?.startsWith('/marketplace/') && <Link href={href} className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-accent-hover">View details<span aria-hidden="true"> &rarr;</span></Link>}</div>{!read && <button type="button" aria-label={'Mark ' + title + ' as read'} title="Mark as read" disabled={pending} className="inline-flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-glass-light focus-visible:outline-2 focus-visible:outline-accent-primary disabled:opacity-50" onClick={() => { void markRead() }}>{pending ? <LoaderCircle className="size-5 animate-spin" aria-hidden="true" /> : <Check className="size-5" aria-hidden="true" />}</button>}</div>{error && <p role="alert" className="mt-3 break-words text-xs leading-5 text-trust-flagged">{error}</p>}</article>
}
