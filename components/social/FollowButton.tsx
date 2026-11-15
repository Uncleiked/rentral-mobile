'use client'
import { useRef, useState } from 'react'
import { UserCheck, UserPlus, LoaderCircle } from 'lucide-react'
import { socialPersonSchema, type SocialPerson } from '@/lib/contracts/social'
import { socialError, socialRequest, SocialRequestError } from '@/lib/social/client'
export function FollowButton({ person, actorId, onChange }: { person: SocialPerson; actorId: string; onChange: (person: SocialPerson) => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const command = useRef<{ clientId: string; following: boolean } | null>(null)
  if (person.id === actorId) return null
  async function check() {
    if (busy) return
    setBusy(true); setError('')
    try { const current = await socialRequest('/api/v1/people/' + person.id, socialPersonSchema, undefined, actorId); if (command.current?.following === current.following) command.current = null; onChange(current) }
    catch (reason) { setError(socialError(reason)) }
    finally { setBusy(false) }
  }
  async function change() {
    if (busy) return
    setBusy(true); setError('')
    command.current ??= { clientId: crypto.randomUUID(), following: !person.following }
    try {
      // Resolve a lost acknowledgement before creating any replacement command.
      const result = await socialRequest('/api/v1/people/' + person.id + '/follow', socialPersonSchema, command.current, actorId)
      command.current = null; onChange(result)
    } catch (reason) {
      if (reason instanceof SocialRequestError && reason.status >= 400 && reason.status < 500 && reason.code !== 'INVALID_RESPONSE') command.current = null
      setError(socialError(reason))
    } finally { setBusy(false) }
  }
  return <div className="min-w-0"><button type="button" aria-pressed={person.following} disabled={busy || person.blocked} onClick={() => { void change() }} className={'inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-accent-primary disabled:opacity-50 ' + (person.following ? 'border-border-subtle text-text-secondary hover:bg-glass-light' : 'border-accent-primary bg-accent-primary text-text-inverse')}>{busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : person.following ? <UserCheck className="size-4" aria-hidden="true" /> : <UserPlus className="size-4" aria-hidden="true" />}{person.following ? 'Following' : person.followedBy ? 'Follow back' : 'Follow'}</button>{error && <div className="mt-2 max-w-xs"><p role="alert" className="break-words text-xs leading-5 text-trust-flagged">{error}</p><button type="button" disabled={busy} className="min-h-11 text-xs underline" onClick={() => { void check() }}>Check follow status</button></div>}</div>
}
