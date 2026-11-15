'use client'
import { useEffect, useState } from 'react'
import { z } from 'zod'
import { socialRequest, socialError } from '@/lib/social/client'
const sessionSchema = z.object({ user: z.object({ id: z.uuid() }).nullable() })
let pending: Promise<string> | null = null
function currentActor(): Promise<string> {
  if (!pending) pending = socialRequest('/api/v1/auth/web-session', sessionSchema).then(result => { if (!result.user) throw new Error('Sign in to use social features.'); return result.user.id }).finally(() => { pending = null })
  return pending
}
export function useSocialActor(knownActorId?: string) {
  const [actorId, setActorId] = useState<string | null>(null), [error, setError] = useState(''), [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (knownActorId) return
    let active = true
    void currentActor().then(id => { if (active) { setActorId(id); setError('') } }).catch(reason => { if (active) setError(socialError(reason)) })
    return () => { active = false }
  }, [knownActorId, attempt])
  return { actorId: knownActorId ?? actorId, error, retry: () => { setError(''); setAttempt(value => value + 1) } }
}
