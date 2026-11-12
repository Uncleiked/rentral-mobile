import { z } from 'zod'

export const directPublicationCommandSchema = z.object({ clientId: z.string().uuid(), expectedRevision: z.number().int().nonnegative() }).strict()
export const directPublicationStateSchema = z.object({ id: z.string().uuid(), revision: z.number().int().nonnegative(), status: z.string().min(1).max(80), trustedPublisher: z.boolean(), canPublish: z.boolean(), message: z.string().max(500) }).strict()
export type DirectPublicationCommand = z.infer<typeof directPublicationCommandSchema>
export type DirectPublicationState = z.infer<typeof directPublicationStateSchema>
