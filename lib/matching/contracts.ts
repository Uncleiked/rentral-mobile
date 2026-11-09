import { z } from 'zod'
import { MATCH_AREAS, matchMoneySchema, matchPreferencesSchema } from './policy'

const date = z.string().datetime({ offset: true })
const username = z.string().regex(/^[a-z0-9_]{3,24}$/).nullable()
export const publicMatchProfileSchema = matchPreferencesSchema.safeExtend({ id: z.uuid(), username, avatarUrl: z.string().max(1000).nullable(), currency: z.literal('NGN') }).strict()
export const ownMatchProfileSchema = publicMatchProfileSchema.safeExtend({ isVisible: z.boolean(), moderationStatus: z.enum(['clear', 'restricted']),
  moderationReason: z.string().max(2000).nullable(), createdAt: date, updatedAt: date }).strict()
export const matchCandidateSchema = publicMatchProfileSchema.safeExtend({ overlap: z.object({ score: z.number().int().min(0).max(100), reasons: z.array(z.string().max(180)).min(1).max(8),
  sharedAreas: z.array(z.enum(MATCH_AREAS)).min(1).max(3), budgetOverlap: z.object({ minKobo: matchMoneySchema, maxKobo: matchMoneySchema }).strict(),
}).strict() }).strict()
export const matchMessageSchema = z.object({ id: z.uuid(), clientId: z.uuid(), own: z.boolean(), body: z.string().min(1).max(2000), createdAt: date }).strict()
export const matchConnectionSchema = z.object({ id: z.uuid(), status: z.enum(['requested', 'accepted', 'declined', 'closed']), requestedByMe: z.boolean(),
  other: publicMatchProfileSchema, acceptedAt: date.nullable(), createdAt: date, updatedAt: date, lastActivityAt: date, otherReadAt: date.nullable(), unread: z.boolean(),
  lastMessage: z.object({ own: z.boolean(), body: z.string().max(180), createdAt: date }).strict().nullable(),
}).strict()
export const matchCandidatePageSchema = z.object({ items: z.array(matchCandidateSchema).max(50), nextCursor: z.string().nullable(), limit: z.number().int().min(1).max(50) }).strict()
export const matchConnectionPageSchema = z.object({ items: z.array(matchConnectionSchema).max(50), nextCursor: z.string().nullable(), limit: z.number().int().min(1).max(50) }).strict()
export const matchMessagePageSchema = z.object({ items: z.array(matchMessageSchema).max(50), nextCursor: z.string().nullable(), limit: z.number().int().min(1).max(50) }).strict()
export const matchingBlockPageSchema = z.object({ items: z.array(z.object({ id: z.uuid(), profileId: z.uuid().nullable(), username, createdAt: date }).strict()).max(50),
  nextCursor: z.string().nullable(), limit: z.number().int().min(1).max(50) }).strict()
export const ownMatchingReportsSchema = z.object({ items: z.array(z.object({ id: z.uuid(), reason: z.string().min(20).max(4000), status: z.enum(['open', 'resolved']),
  createdAt: date, reviewedAt: date.nullable(), resolution: z.string().max(2000).nullable() }).strict()).max(50), nextCursor: z.string().nullable(), limit: z.number().int().min(1).max(50) }).strict()
export type PublicMatchProfile = z.infer<typeof publicMatchProfileSchema>
export type OwnMatchProfile = z.infer<typeof ownMatchProfileSchema>
export type MatchCandidate = z.infer<typeof matchCandidateSchema>
export type MatchConnection = z.infer<typeof matchConnectionSchema>
export type MatchMessage = z.infer<typeof matchMessageSchema>
