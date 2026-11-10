import { z } from 'zod'
import { adminCommandSchema, type AdminCommand } from '../contracts/admin'

const recordSchema = z.object({ actorId: z.uuid(), command: adminCommandSchema }).strict()
const key = (actorId: string) => `rentral.admin.command.${z.uuid().parse(actorId)}`

export function readAdminCommand(actorId: string): AdminCommand | null {
  const raw = window.sessionStorage.getItem(key(actorId))
  if (raw === null) return null
  if (raw.length > 12000) throw new Error('The saved admin instruction needs review. Keep it and check the audit trail.')
  const saved = recordSchema.parse(JSON.parse(raw))
  if (saved.actorId !== actorId) throw new Error('This instruction belongs to another administrator.')
  return saved.command
}

export function saveAdminCommand(actorId: string, input: unknown): AdminCommand {
  const command = adminCommandSchema.parse(input)
  const existing = readAdminCommand(actorId)
  if (existing && JSON.stringify(existing) !== JSON.stringify(command)) throw new Error('Confirm the original admin instruction before preparing another.')
  window.sessionStorage.setItem(key(actorId), JSON.stringify(recordSchema.parse({ actorId, command })))
  return command
}

export function clearAdminCommand(actorId: string, clientId: string): void {
  const existing = readAdminCommand(actorId)
  if (existing && existing.clientId !== clientId) throw new Error('The saved instruction changed. Reopen its status before continuing.')
  window.sessionStorage.removeItem(key(actorId))
}
