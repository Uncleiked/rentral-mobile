import { z } from 'zod'
export const socialPersonSchema=z.object({id:z.uuid(),username:z.string().max(24).nullable(),displayName:z.string().max(120),avatarUrl:z.string().max(1000).nullable(),accountType:z.enum(['individual','organization']),following:z.boolean(),followedBy:z.boolean(),followersCount:z.number().int().nonnegative().safe(),followingCount:z.number().int().nonnegative().safe(),blocked:z.boolean()}).strict()
export const peoplePageSchema=z.object({items:z.array(socialPersonSchema).max(50),nextCursor:z.string().max(900).nullable(),hasMore:z.boolean()}).strict()
export const peopleSearchSchema=z.object({query:z.string().trim().max(100).default(''),cursor:z.string().max(900).regex(/^[A-Za-z0-9_-]+$/).optional(),limit:z.coerce.number().int().min(1).max(50).default(20)}).strict()
export const peopleConnectionsSchema=peopleSearchSchema.omit({query:true}).extend({kind:z.enum(['followers','following'])}).strict()
export const followCommandSchema=z.object({clientId:z.uuid(),following:z.boolean()}).strict()
export const blockCommandSchema=z.object({clientId:z.uuid(),blocked:z.boolean()}).strict()
export const listingLikeSchema=z.object({listingId:z.uuid(),liked:z.boolean(),count:z.number().int().nonnegative().safe()}).strict()
export const likeCommandSchema=z.object({clientId:z.uuid(),liked:z.boolean()}).strict()
export type SocialPerson=z.infer<typeof socialPersonSchema>
export type PeoplePage=z.infer<typeof peoplePageSchema>
export type ListingLikeSummary=z.infer<typeof listingLikeSchema>

export const blockStateSchema = z.object({ personId: z.uuid(), blocked: z.boolean() }).strict()
export type BlockState = z.infer<typeof blockStateSchema>
