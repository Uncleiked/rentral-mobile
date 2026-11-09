import { useCallback, useEffect, useRef, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import * as Crypto from 'expo-crypto'
import { useAuth } from '../providers/AuthProvider'
import { errorMessage } from '../lib/api'
import { loadBookingHistory } from '../lib/booking-api'
import type { BookingDetail, BookingRequestInput } from '../lib/booking-contracts'
import { dismissPendingBooking, loadPendingBooking, submitPendingBooking, type PendingBooking } from '../lib/booking-pending-store'

type Snapshot = { actorId: string; record: PendingBooking | null; error: string | null }
export function useBookingRequestRecovery() {
  const { session } = useAuth()
  const actorId = session?.user.id ?? ''
  const actor = useRef(actorId)
  useEffect(() => { actor.current = actorId }, [actorId])
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [result, setResult] = useState<{ actorId: string; booking: BookingDetail } | null>(null)
  const [history, setHistory] = useState<{ actorId: string; items: BookingDetail[]; limit: number } | null>(null)
  const [checked, setChecked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const pending = useRef(false)
  const generation = useRef(0)
  const current = snapshot?.actorId === actorId ? snapshot : null
  useFocusEffect(useCallback(() => {
    if (!actorId) return
    const started = ++generation.current
    setChecked(false)
    void loadPendingBooking(actorId).then(record => {
      if (started === generation.current) setSnapshot({ actorId, record, error: null })
    }, reason => { if (started === generation.current) setSnapshot({ actorId, record: null, error: errorMessage(reason) }) })
    return () => { generation.current++ }
  }, [actorId]))

  async function send(input?: BookingRequestInput): Promise<void> {
    if (pending.current || !actorId || !current || current.error || (current.record && !checked && !current.record.confirmedId)) return
    const command = current.record?.command ?? (input ? { ...input, clientId: Crypto.randomUUID() } : null)
    if (!command) return
    const capturedActor = actorId
    pending.current = true; setBusy(true); setMessage(null); setChecked(false)
    setSnapshot({ actorId, record: current.record ?? { command }, error: null })
    try {
      const confirmation = await submitPendingBooking(capturedActor, command)
      if (actor.current === capturedActor) {
        setResult({ actorId: capturedActor, booking: confirmation.booking })
        setSnapshot({ actorId: capturedActor, record: confirmation.cleanupPending ? { command, confirmedId: confirmation.booking.id } : null, error: null })
        setMessage(confirmation.cleanupPending ? 'Your booking request is confirmed. Its local recovery record could not be cleared; confirm it again before starting another request.' : 'Request sent. Open your booking to follow its status.')
      }
    } catch (reason) {
      if (actor.current === capturedActor) {
        setMessage(errorMessage(reason))
        try {
          const record = await loadPendingBooking(capturedActor)
          if (actor.current === capturedActor) setSnapshot({ actorId: capturedActor, record, error: null })
        } catch (failure) {
          if (actor.current === capturedActor) setSnapshot({ actorId: capturedActor, record: null, error: errorMessage(failure) })
        }
      }
    } finally { pending.current = false; setBusy(false) }
  }
  async function check(): Promise<void> {
    if (pending.current || !actorId) return
    const capturedActor = actorId
    pending.current = true; setBusy(true); setMessage(null)
    try {
      const page = await loadBookingHistory(capturedActor)
      if (actor.current === capturedActor) {
        setHistory({ actorId: capturedActor, ...page }); setChecked(true)
        setMessage(`Loaded your latest ${page.items.length} bookings (at most ${page.limit}). An absent request may be older than this window. Retrying below always uses the original request identifier and dates.`)
      }
    } catch (reason) { if (actor.current === capturedActor) setMessage(errorMessage(reason)) }
    finally { pending.current = false; setBusy(false) }
  }
  async function dismiss(): Promise<void> {
    if (pending.current || !actorId || !checked) return
    const capturedActor = actorId
    pending.current = true; setBusy(true)
    try {
      await dismissPendingBooking(capturedActor)
      if (actor.current === capturedActor) {
        setSnapshot({ actorId: capturedActor, record: null, error: null }); setChecked(false)
        setMessage('The local recovery record was dismissed. This does not cancel a booking already recorded by Rentral.')
      }
    } catch (reason) { if (actor.current === capturedActor) setMessage(errorMessage(reason)) }
    finally { pending.current = false; setBusy(false) }
  }
  return { ready: Boolean(current), record: current?.record ?? null, recoveryError: current?.error ?? null,
    booking: result?.actorId === actorId ? result.booking : null, history: history?.actorId === actorId ? history.items : [], checked, busy, message, send, check, dismiss }
}
