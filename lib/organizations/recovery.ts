import { z } from 'zod'
import { organizationReviewSchema, organizationSubmissionSchema } from '../contracts/organizations'
const pendingSchema = z.discriminatedUnion('scope', [
  z.object({ actorId: z.uuid(), scope: z.literal('submit'), command: organizationSubmissionSchema }).strict(),
  z.object({ actorId: z.uuid(), scope: z.literal('review'), command: organizationReviewSchema }).strict(),
])
type Scope = 'submit' | 'review'
export type OrganizationPending = z.infer<typeof pendingSchema>
function key(actorId: string, scope: Scope): string { return 'rentral.organization.' + scope + '.' + z.uuid().parse(actorId) }
export function readOrganizationPending(actorId: string, scope: Scope): OrganizationPending | null {
  const raw = window.sessionStorage.getItem(key(actorId, scope))
  if (raw === null) return null
  if (raw.length > 16000) throw new Error('The saved organization instruction needs review. Keep its browser data and contact support.')
  const pending = pendingSchema.parse(JSON.parse(raw))
  if (pending.actorId !== actorId || pending.scope !== scope) throw new Error('This instruction belongs to another account.')
  return pending
}
export function saveOrganizationPending(input: OrganizationPending): OrganizationPending {
  const pending = pendingSchema.parse(input)
  const previous = readOrganizationPending(pending.actorId, pending.scope)
  if (previous && JSON.stringify(previous) !== JSON.stringify(pending)) throw new Error('Confirm the original organization instruction before preparing another.')
  window.sessionStorage.setItem(key(pending.actorId, pending.scope), JSON.stringify(pending))
  return pending
}
export function clearOrganizationPending(actorId: string, scope: Scope, clientId: string): void {
  const previous = readOrganizationPending(actorId, scope)
  if (previous && previous.command.clientId !== clientId) throw new Error('The original organization instruction changed.')
  window.sessionStorage.removeItem(key(actorId, scope))
}
