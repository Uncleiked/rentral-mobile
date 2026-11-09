import { z } from 'zod'

const date = z.string().datetime({ offset: true })
const requestStatus = z.enum(['pending_counterparty', 'pending_review', 'approved', 'rejected'])
export const renewalDto = z.object({ id: z.uuid(), bookingId: z.uuid(), reference: z.string().max(150), recipientRoute: z.enum(['original_agent', 'direct_landlord']),
  status: requestStatus, role: z.enum(['renter', 'host']), originalEndsAt: date.nullable(), requestedEndsAt: date.nullable(),
  needsDetails: z.boolean(), evidenceEndpoint: z.string().nullable(), hostConfirmedAt: date.nullable(), reviewedAt: date.nullable(),
  decisionReason: z.string().max(2000).nullable(), createdAt: date, paymentProviderVerified: z.literal(false),
  actions: z.object({ confirm: z.boolean() }).strict(),
}).strict()
export const terminationDto = z.object({ id: z.uuid(), bookingId: z.uuid(), role: z.enum(['renter', 'host']), requestedBy: z.enum(['renter', 'host']),
  reason: z.string().min(20).max(4000), status: z.enum(['pending_counterparty', 'pending_review', 'approved', 'rejected', 'released']),
  originalEndsAt: date, requestedEndAt: date, evidenceEndpoint: z.string().nullable(),
  counterpartyDecision: z.enum(['pending', 'accepted', 'rejected']), counterpartyDecidedAt: date.nullable(), counterpartyReason: z.string().max(2000).nullable(),
  reviewedAt: date.nullable(), decisionReason: z.string().max(2000).nullable(), releasedAt: date.nullable(), createdAt: date,
  actions: z.object({ confirm: z.boolean() }).strict(),
}).strict()
const archive = { nextCursor: z.string().max(100).nullable(), limit: z.number().int().min(1).max(50) }
export const renewalArchiveSchema = z.object({ items: z.array(renewalDto).max(50), ...archive }).strict()
export const terminationArchiveSchema = z.object({ items: z.array(terminationDto).max(50), ...archive }).strict()
export const renewalRequestSchema = z.object({ bookingId: z.uuid(), reference: z.string().trim().min(6).max(150).regex(/^[\w .:/-]+$/),
  recipientRoute: z.enum(['original_agent', 'direct_landlord']), requestedEndsAt: date, evidencePath: z.string().min(1).max(500) }).strict()
export const terminationRequestSchema = z.object({ bookingId: z.uuid(), requestedEndAt: date,
  reason: z.string().trim().min(20).max(4000), evidencePath: z.string().min(1).max(500) }).strict()
export const lifecycleCounterpartySchema = z.object({ decision: z.enum(['accept', 'reject']), reason: z.string().trim().min(15).max(2000) }).strict()
export type MemberRenewal = z.infer<typeof renewalDto>
export type MemberTermination = z.infer<typeof terminationDto>
