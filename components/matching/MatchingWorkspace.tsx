'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import type { OwnMatchProfile } from '@/lib/matching/contracts'
import { matchingProfileResultSchema, matchingSecondary } from '@/lib/matching/client'
import { useMatchingRequest } from '@/components/account/ApiActorScope'
import { MatchingPreferences } from './MatchingPreferences'
import { MatchingContacts, MatchingDiscovery } from './MatchingDiscovery'

export function MatchingWorkspace() {
  const matchingRequest = useMatchingRequest()
  const [profile, setProfile] = useState<OwnMatchProfile | null>(null), [loaded, setLoaded] = useState(false), [message, setMessage] = useState('')
  const [tab, setTab] = useState<'preferences' | 'discover' | 'contacts'>('preferences'), [revision, setRevision] = useState(0)
  const load = useCallback(async () => {
    setLoaded(false)
    try { const result = await matchingRequest('squat-mates/profile', matchingProfileResultSchema); setProfile(result.profile); setRevision(value => value + 1); setMessage(''); setLoaded(true) }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Matching is unavailable. Refresh in a moment.') }
  }, [matchingRequest])
  useEffect(() => { const first = setTimeout(() => void load(), 0); return () => clearTimeout(first) }, [load])
  const discoverable = profile?.isVisible && profile.moderationStatus === 'clear'
  return <div className="space-y-7"><nav aria-label="Squat-Mates" className="flex flex-wrap gap-3">{(['preferences', 'discover', 'contacts'] as const).map(value => <button key={value} aria-current={tab === value ? 'page' : undefined} className={matchingSecondary} onClick={() => setTab(value)}>{value === 'preferences' ? 'Your preferences' : value === 'discover' ? 'Find people' : 'Contacts'}</button>)}<Link href="/marketplace/squat-mates/blocks" className={matchingSecondary}>Blocked contacts</Link><Link href="/marketplace/squat-mates/reports" className={matchingSecondary}>Private reports</Link><button onClick={() => void load()} className={matchingSecondary}>Refresh settings</button></nav>
    {!loaded ? <p role="status" className="rounded-2xl border border-border-subtle p-6 text-sm text-text-muted">{message || 'Loading matching preferences…'}</p> : <>{tab === 'preferences' ? <MatchingPreferences key={revision} profile={profile} onSaved={setProfile} /> : !discoverable ? <p className="rounded-2xl border border-border-subtle p-6 text-sm leading-relaxed text-text-muted">Save your preferences and explicitly choose to show your profile to discover and contact members. Any safety restriction also needs independent review. You can still manage blocks and private reports.</p> : tab === 'discover' ? <MatchingDiscovery /> : <MatchingContacts />}</>}
  </div>
}
