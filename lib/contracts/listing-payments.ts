import { z } from 'zod'

export const PUBLICATION_FEE_KOBO = '100000' as const
const environment = z.enum(['test', 'live']).nullable()
const timestamp = z.string().datetime({ offset: true })
export const publicationFeeReferenceSchema = z.string().regex(/^rentral-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/)
export const publicationFeeSchema = z.object({ listingId: z.uuid(), currency: z.literal('NGN'), amountKobo: z.literal(PUBLICATION_FEE_KOBO),
  paymentAvailable: z.boolean(), environment, listingStatus: z.string().min(1).max(80), archived: z.boolean(),
  waived: z.boolean().optional().default(false),
  payment: z.object({ id: z.uuid(), reference: publicationFeeReferenceSchema,
    status: z.enum(['created', 'initializing', 'pending', 'uncertain', 'succeeded', 'requires_review', 'failed', 'abandoned', 'reversed']),
    environment, amountKobo: z.literal(PUBLICATION_FEE_KOBO), currency: z.literal('NGN'), createdAt: timestamp, paidAt: timestamp.nullable() }).strict().nullable(),
  actions: z.object({ checkout: z.boolean(), reconcile: z.boolean() }).strict(),
}).strict()
export const publicationFeeCheckoutSchema = z.object({ paymentId: z.uuid(), reference: publicationFeeReferenceSchema, environment: z.enum(['test', 'live']), url: z.string().max(2000).url().refine(value => {
  try { const url = new URL(value); return url.protocol === 'https:' && url.hostname === 'checkout.paystack.com' && !url.username && !url.password && !url.port && !url.hash }
  catch { return false }
}) }).strict()
export const publicationFeeReconcileSchema = z.object({ reference: publicationFeeReferenceSchema }).strict()
export type PublicationFee = z.infer<typeof publicationFeeSchema>
