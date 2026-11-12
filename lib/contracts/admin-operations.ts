import { z } from 'zod'
import { adminAuditSchema } from './admin'
const timestamp=z.string().datetime()
export const adminOverviewSchema=z.object({generatedAt:timestamp,queues:z.array(z.object({id:z.enum(['listings','organizations','inspections','reports','appeals','renewals','terminations']),label:z.string().max(100),count:z.number().int().nonnegative().safe(),oldestAt:timestamp.nullable(),href:z.string().startsWith('/'),tab:z.enum(['listings','organizations','inspections']).nullable()}).strict()).max(7)}).strict()
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>{const d=new Date(value+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value},'Enter a valid date.')
export const adminAuditSearchSchema=z.object({query:z.string().trim().max(254).default(''),targetType:z.enum(['all','listing','user','organization','booking','dispute','safety_notice','safety_appeal']).default('all'),from:day.optional(),to:day.optional(),sort:z.enum(['newest','oldest']).default('newest'),cursor:z.string().regex(/^[A-Za-z0-9_-]+$/).max(700).optional(),limit:z.coerce.number().int().min(1).max(50).default(25)}).strict().refine(value=>!value.from||!value.to||value.from<=value.to,{message:'The end date must follow the start date.',path:['to']})
export const adminAuditPageSchema=z.object({items:z.array(adminAuditSchema.extend({actorUsername:z.string().max(24).nullable()}).strict()).max(50),total:z.number().int().nonnegative().safe(),hasMore:z.boolean(),nextCursor:z.string().max(700).nullable()}).strict()
export type AdminOverview=z.infer<typeof adminOverviewSchema>
export type AdminAuditPage=z.infer<typeof adminAuditPageSchema>
