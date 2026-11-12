'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { z } from 'zod'
import { directPublicationCommandSchema, directPublicationStateSchema, type DirectPublicationCommand, type DirectPublicationState } from '@/lib/contracts/direct-publication'
import { CaptureRequestError, listingRequest } from '@/lib/listings/capture-client'

const savedCommandSchema = directPublicationCommandSchema.extend({ listingId: z.string().uuid() }).strict()
const button = 'inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-border-subtle px-4 py-3 text-sm font-semibold disabled:opacity-50'
export function DirectPublicationPanel({ actorId, state }: { actorId: string; state: DirectPublicationState }) {
  const router = useRouter()
  const [pending, setPending] = useState<DirectPublicationCommand | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [canRetry, setCanRetry] = useState(false)
  const [storageError, setStorageError] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const active = useRef(true), inFlight = useRef(false)
  const key = `rentral.publish.${actorId}.${state.id}`
  useEffect(() => {
    active.current = true
    let current = true
    void Promise.resolve().then(() => {
      if (!current) return
      try {
        const value = sessionStorage.getItem(key)
        if (value) {
          const saved = savedCommandSchema.parse(JSON.parse(value))
          if (saved.listingId !== state.id) throw new Error('Wrong listing request.')
          setPending({ clientId: saved.clientId, expectedRevision: saved.expectedRevision })
          setMessage('An earlier publication request needs confirmation. Check it before sending another.')
        }
      } catch { setStorageError(true); setMessage('Saved publication instructions could not be read. Review the listing before clearing browser storage.') }
      setHydrated(true)
    })
    return () => { current = false; active.current = false }
  }, [key, state.id])
  async function confirmed(result: DirectPublicationState): Promise<void> {
    if (result.id !== state.id) throw new Error('This result belongs to another listing.')
    if (!active.current) return
    sessionStorage.removeItem(key); setPending(null); setCanRetry(false)
    setMessage(result.status === 'active' ? 'Your listing is live.' : result.message)
    router.refresh()
  }
  async function run(task: () => Promise<void>): Promise<void> {
    if (inFlight.current) return
    inFlight.current = true; setBusy(true); setCanRetry(false)
    try { await task() } catch (error) {
      if (active.current) setMessage(error instanceof Error ? error.message : 'This publication result could not be confirmed.')
    } finally { inFlight.current = false; if (active.current) setBusy(false) }
  }
  async function send(command: DirectPublicationCommand): Promise<void> {
    try {
      const result = await listingRequest(actorId, `/api/v1/my-listings/${state.id}/publish`, directPublicationStateSchema, command)
      await confirmed(result)
    } catch (error) {
      if (error instanceof CaptureRequestError && error.status >= 400 && error.status < 500 && error.code !== 'INVALID_RESPONSE') {
        sessionStorage.removeItem(key); if (active.current) { setPending(null); setCanRetry(false); router.refresh() }
      }
      throw error
    }
  }
  async function start(): Promise<void> {
    if (!state.canPublish || pending || storageError || !hydrated) return
    const command = { clientId: crypto.randomUUID(), expectedRevision: state.revision }
    sessionStorage.setItem(key, JSON.stringify({ ...command, listingId: state.id }))
    setPending(command)
    await send(command)
  }
  async function check(): Promise<void> {
    if (!pending) return
    try {
      await confirmed(await listingRequest(actorId, `/api/v1/my-listings/${state.id}/publish?clientId=${pending.clientId}&expectedRevision=${pending.expectedRevision}`, directPublicationStateSchema))
    } catch (error) {
      if (error instanceof CaptureRequestError && error.status === 404 && error.code === 'REQUEST_UNCONFIRMED') {
        if (active.current) { setCanRetry(true); setMessage('No saved receipt exists yet. You may retry the exact original request below.') }
        return
      }
      throw error
    }
  }
  return <section className="mt-5 min-w-0 space-y-3 rounded-2xl border border-border-subtle bg-background-app p-4" aria-label="Direct publishing">
    <h2 className="text-sm font-semibold">Direct publishing</h2>
    <p className="text-xs leading-5 text-text-secondary">{state.message}</p>
    <p className="text-xs leading-5 text-text-muted">This permission bypasses human approval. It does not represent an independent review of your authority document.</p>
    {message && <p role="status" className="text-xs leading-5 text-text-secondary wrap-anywhere">{message}</p>}
    {pending ? <><button type="button" className={button} disabled={busy || !hydrated || storageError} onClick={() => { void run(check) }}>{busy ? 'Checking...' : 'Check original publication request'}</button>{canRetry && <button type="button" className={button} disabled={busy || storageError} onClick={() => { void run(() => send(pending)) }}>Retry exact original publication request</button>}</> : state.canPublish && <button type="button" className={button + ' bg-accent-primary text-text-inverse'} disabled={busy || !hydrated || storageError} onClick={() => { void run(start) }}>{busy ? 'Publishing...' : 'Finish publishing'}</button>}
  </section>
}
