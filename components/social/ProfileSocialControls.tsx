'use client'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { MessageCircle, RefreshCw, ShieldBan } from 'lucide-react'
import { blockStateSchema, socialPersonSchema, type BlockState, type SocialPerson } from '@/lib/contracts/social'
import { socialError, socialRequest, SocialRequestError } from '@/lib/social/client'
import { useSocialActor } from './useSocialActor'
import { FollowButton } from './FollowButton'
import { PeopleConnections } from './PeopleConnections'
const button = 'inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl border border-border-subtle px-4 py-2 text-sm font-semibold hover:bg-glass-light focus-visible:outline-2 focus-visible:outline-accent-primary disabled:opacity-50'
export function ProfileSocialControls({ profileId, own = false }: { profileId: string; own?: boolean }) {
  const { actorId, error: sessionError, retry: retrySession } = useSocialActor(own ? profileId : undefined)
  const [person, setPerson] = useState<SocialPerson | null>(null), [ownBlock, setOwnBlock] = useState<BlockState | null>(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('')
  const [connections, setConnections] = useState<'followers' | 'following' | null>(null), [confirmBlock, setConfirmBlock] = useState(false), [uncertain, setUncertain] = useState(false)
  const active = useRef(true), command = useRef<{ clientId: string; blocked: boolean } | null>(null)
  const blocked = ownBlock?.blocked ?? person?.blocked ?? false
  const blockPath = '/api/v1/people/' + profileId + '/block'
  const readBlock = useCallback(async () => {
    const state = await socialRequest(blockPath, blockStateSchema, undefined, actorId ?? undefined)
    if (state.personId !== profileId) throw new SocialRequestError('This block status could not be confirmed. Try checking again.', 200, 'INVALID_RESPONSE')
    if (active.current) {
      setOwnBlock(state)
      setPerson(current => current ? { ...current, blocked: state.blocked, ...(state.blocked ? { following: false, followedBy: false } : {}) } : current)
      if (command.current?.blocked === state.blocked) { command.current = null; setUncertain(false); setConfirmBlock(false) }
    }
    return state
  }, [actorId, blockPath, profileId])
  const load = useCallback(async () => {
    if (!actorId) return
    try {
      const result = await socialRequest('/api/v1/people/' + profileId, socialPersonSchema, undefined, actorId)
      if (active.current) { setPerson(result); setOwnBlock({ personId: profileId, blocked: result.blocked }); setError('') }
    } catch (reason) {
      if (active.current) { setPerson(null); setError(socialError(reason)) }
      // A member can always recover their own block even when a public profile is unavailable.
      if (profileId !== actorId) { try { await readBlock() } catch { /* Keep the original, non-disclosing profile error. */ } }
    }
  }, [actorId, profileId, readBlock])
  useEffect(() => { active.current = true; const start = setTimeout(() => { void load() }, 0); return () => { active.current = false; clearTimeout(start) } }, [load])
  async function block() {
    if (!actorId || busy || (!person && !blocked && !command.current)) return
    setBusy(true); setError(''); setMessage('')
    command.current ??= { clientId: crypto.randomUUID(), blocked: !blocked }
    try {
      const state = await socialRequest(blockPath, blockStateSchema, command.current, actorId)
      if (state.personId !== profileId) throw new SocialRequestError('This decision could not be confirmed. Check its current status.', 200, 'INVALID_RESPONSE')
      command.current = null
      if (active.current) {
        setOwnBlock(state); setPerson(current => current ? { ...current, blocked: state.blocked, ...(state.blocked ? { following: false, followedBy: false } : {}) } : current)
        setConfirmBlock(false); setUncertain(false); setMessage(state.blocked ? 'Member blocked.' : 'Your block was removed.')
      }
      if (!state.blocked) await load()
    } catch (reason) {
      if (reason instanceof SocialRequestError && reason.status >= 400 && reason.status < 500 && reason.code !== 'INVALID_RESPONSE') { command.current = null; setUncertain(false) }
      else setUncertain(true)
      if (active.current) setError(socialError(reason))
    } finally { if (active.current) setBusy(false) }
  }
  async function checkBlock() {
    if (busy || !actorId) return
    setBusy(true); setError('')
    try { const state = await readBlock(); setMessage(state.blocked ? 'Your block is recorded.' : 'You have not blocked this member.'); if (!state.blocked) await load() }
    catch (reason) { setError(socialError(reason)) }
    finally { if (active.current) setBusy(false) }
  }
  return <section aria-label="Profile connections" className="min-w-0 space-y-3"><div className="flex min-w-0 flex-wrap items-center gap-3">{!blocked && <><button type="button" disabled={!person || !actorId || busy} className={button} onClick={() => setConnections('followers')}><strong>{person?.followersCount.toLocaleString() ?? '...'}</strong>Followers</button><button type="button" disabled={!person || !actorId || busy} className={button} onClick={() => setConnections('following')}><strong>{person?.followingCount.toLocaleString() ?? '...'}</strong>Following</button></>}{person && actorId && !own && profileId !== actorId && !blocked && <><FollowButton person={person} actorId={actorId} onChange={setPerson} /><Link className={button} href={'/marketplace/messages?user=' + profileId}><MessageCircle className="size-4" />Message</Link></>}{!own && actorId && profileId !== actorId && (person || blocked) && <button type="button" className={button + ' text-text-muted'} disabled={busy} onClick={() => setConfirmBlock(value => !value)}><ShieldBan className="size-4" />{blocked ? 'Unblock' : 'Block'}</button>}</div>{person?.followedBy && !blocked && <p className="text-xs text-text-muted">Follows you</p>}{confirmBlock && <div className="max-w-xl space-y-3 rounded-xl border border-border-subtle bg-surface-card p-4"><h2 className="text-sm font-semibold">{blocked ? 'Unblock this member?' : 'Block this member?'}</h2><p className="text-sm leading-6 text-text-muted">{blocked ? 'Remove your block for this member. Previous follow connections are not restored.' : 'Your follow connections will be removed. They will not be able to follow you or start new messages while blocked.'}</p><div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={busy} onClick={() => { void block() }}>{busy ? 'Saving...' : blocked ? 'Confirm unblock' : 'Confirm block'}</button><button type="button" className={button} disabled={busy} onClick={() => setConfirmBlock(false)}>Cancel</button></div></div>}{message && <p role="status" className="text-xs leading-5 text-accent-hover">{message}</p>}{(error || sessionError) && <div><p role="alert" className="break-words text-xs leading-5 text-trust-flagged">{error || sessionError}</p>{!actorId && <button type="button" className={button + ' mt-2'} onClick={retrySession}>Retry account check</button>}{actorId && <div className="mt-2 flex flex-wrap gap-2"><button type="button" className={button} disabled={busy} onClick={() => { void load() }}><RefreshCw className="size-4" />Refresh connections</button>{profileId !== actorId && <button type="button" className={button} disabled={busy} onClick={() => { void checkBlock() }}>Check block status</button>}{uncertain && <button type="button" className={button} disabled={busy} onClick={() => { void block() }}>Retry original decision</button>}</div>}</div>}{connections && actorId && <PeopleConnections profileId={profileId} actorId={actorId} kind={connections} onClose={() => { setConnections(null); void load() }} />}</section>
}
