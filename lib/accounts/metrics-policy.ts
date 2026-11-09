type MessageObservation = { id: string; conversation_id: string; sender_id: string; createdAt: Date }

/** Measures replies to an incoming turn, rather than treating each repeated
 * incoming message as another unanswered request. No message body is read. */
export function responseObservations(actorId: string, rows: MessageObservation[], complete: boolean) {
  const waiting = new Map<string, number>()
  let total = 0, samples = 0
  const ordered = [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))
  for (const row of ordered) {
    const timestamp = row.createdAt.getTime()
    if (!Number.isFinite(timestamp)) continue
    if (row.sender_id !== actorId) {
      if (!waiting.has(row.conversation_id)) waiting.set(row.conversation_id, timestamp)
    } else {
      const receivedAt = waiting.get(row.conversation_id)
      if (receivedAt !== undefined && timestamp >= receivedAt) { total += timestamp - receivedAt; samples += 1; waiting.delete(row.conversation_id) }
    }
  }
  return { averageMinutes: complete && samples ? Math.round(total / samples / 6000) / 10 : null, samples, complete }
}

type InspectionObservation = { seeker_id: string; starts_at: Date; seeker_checked_in_at: Date | null; lister_checked_in_at: Date | null }
export function inspectionObservations(actorId: string, rows: InspectionObservation[], complete: boolean) {
  if (!complete) return { eligible: null, recorded: null, ratePercent: null, complete: false }
  const recorded = rows.filter(row => {
    const checkIn = row.seeker_id === actorId ? row.seeker_checked_in_at : row.lister_checked_in_at
    // The actual inspection service accepts readings within four hours.
    return checkIn && Number.isFinite(checkIn.getTime()) && Math.abs(checkIn.getTime() - row.starts_at.getTime()) <= 4 * 60 * 60 * 1000
  }).length
  return { eligible: rows.length, recorded, ratePercent: rows.length ? Math.round(recorded / rows.length * 1000) / 10 : null, complete: true }
}
