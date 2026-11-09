import { createHash } from 'node:crypto'
import type { MutationReceipt, Prisma } from '@prisma/client'
import { z } from 'zod'
import prisma from '@/lib/db'

export class MutationConflictError extends Error {
  readonly code = 'INVALID_RETRY'
  readonly status = 409
  constructor() { super('This request identifier belongs to different instructions. Reconcile the original request before starting another.'); this.name = 'MutationConflictError' }
}

type Scope = 'listing_submit' | 'listing_draft_save' | 'booking_create'
export type MutationCommand = Readonly<{ id: string; actor_id: string; scope: Scope; client_id: string; input_hash: string }>

function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))) return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(item => canonical(item === undefined ? null : item)).join(',')}]`
  if (typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).sort().filter(key => Reflect.get(value, key) !== undefined).map(key => `${JSON.stringify(key)}:${canonical(Reflect.get(value, key))}`).join(',')}}`
  }
  throw new Error('A mutation command must contain JSON values only.')
}

/** Call after normal validation. Hash normalized input, never a provider response. */
export function mutationCommand(actorId: string, scope: Scope, clientId: string | undefined, input: unknown): MutationCommand | null {
  if (!clientId) return null
  const client = z.uuid().parse(clientId).toLowerCase()
  const normalized = typeof input === 'object' && input !== null && !Array.isArray(input) ? { ...input, clientId: client } : input
  return { id: createHash('sha256').update(`${actorId}\0${scope}\0${client}`).digest('hex'), actor_id: actorId, scope, client_id: client,
    input_hash: createHash('sha256').update(canonical(normalized)).digest('hex') }
}

function matched(receipt: MutationReceipt | null, command: MutationCommand): string | null {
  if (!receipt) return null
  if (receipt.actor_id !== command.actor_id || receipt.scope !== command.scope || receipt.client_id !== command.client_id || receipt.input_hash !== command.input_hash) throw new MutationConflictError()
  return receipt.resource_id
}

/** Readback also resolves an earlier ambiguous commit; never creates anything. */
export async function committedMutation(command: MutationCommand | null): Promise<string | null> {
  return command ? matched(await prisma.mutationReceipt.findUnique({ where: { id: command.id } }), command) : null
}

export async function transactionMutation(tx: Prisma.TransactionClient, command: MutationCommand | null): Promise<string | null> {
  return command ? matched(await tx.mutationReceipt.findUnique({ where: { id: command.id } }), command) : null
}

/** Resource, private coordinates/file claims and receipt commit atomically. */
export async function recordMutation(tx: Prisma.TransactionClient, command: MutationCommand | null, resourceId: string): Promise<void> {
  if (command) await tx.mutationReceipt.create({ data: { ...command, resource_id: resourceId } })
}
