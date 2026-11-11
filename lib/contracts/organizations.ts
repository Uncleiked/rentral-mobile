import { z } from 'zod'

export const organizationStatusSchema = z.enum(['pending', 'changes_requested', 'rejected', 'approved'])
export const organizationDocumentSchema = z.enum(['cac_certificate', 'cac_status_report'])
export const organizationSupportSchema = z.enum(['authority_letter', 'professional_licence', 'office_address'])
export const organizationSubmissionSchema = z.object({
  clientId: z.uuid(), expectedRevision: z.number().int().nonnegative().optional(),
  legalName: z.string().trim().min(2).max(160),
  registrationType: z.enum(['company', 'business_name', 'llp', 'incorporated_trustees']),
  registrationNumber: z.string().trim().min(2).max(80), representativeName: z.string().trim().min(2).max(120),
  representativeRole: z.string().trim().min(2).max(100), documentKind: organizationDocumentSchema,
  documentPath: z.string().min(1).max(500), supportingKind: organizationSupportSchema.optional(), supportingPath: z.string().min(1).max(500).optional(),
  declaration: z.literal(true),
}).strict().refine(value => Boolean(value.supportingKind) === Boolean(value.supportingPath), 'Choose a supporting document type and file together.')
export const organizationChecklistSchema = z.object({ registrationMatches: z.boolean(), registerChecked: z.boolean(), authorityConfirmed: z.boolean() }).strict()
export const organizationReviewSchema = z.object({ clientId: z.uuid(), targetId: z.uuid(), expectedRevision: z.number().int().nonnegative(),
  decision: z.enum(['approve', 'request_changes', 'reject']), reason: z.string().trim().min(15).max(2000), checklist: organizationChecklistSchema,
}).strict().refine(value => value.decision !== 'approve' || Object.values(value.checklist).every(Boolean), 'Complete every approval check.')
export const organizationViewSchema = z.object({
  id: z.uuid(), userId: z.uuid(), revision: z.number().int().nonnegative(),
  legalName: z.string().max(160), registrationType: z.string().max(40), registrationNumber: z.string().max(80),
  representativeName: z.string().max(120), representativeRole: z.string().max(100), documentKind: organizationDocumentSchema,
  supportingKind: organizationSupportSchema.nullable(), status: organizationStatusSchema, reviewReason: z.string().max(2000).nullable(),
  submittedAt: z.string().datetime(), reviewedAt: z.string().datetime().nullable(),
}).strict()
export const organizationMineSchema = z.object({ application: organizationViewSchema.nullable() }).strict()
export const organizationQueueSchema = z.object({ items: z.array(organizationViewSchema).max(50) }).strict()
export const organizationReceiptSchema = z.object({ clientId: z.uuid(), resourceId: z.uuid(), committed: z.literal(true) }).strict()
export const organizationUploadSchema = z.object({ path: z.string().max(500) }).strict()
export const organizationLinkSchema = z.object({ url: z.string().url().max(3000), expiresAt: z.string().datetime() }).strict()
export type OrganizationView = z.infer<typeof organizationViewSchema>
export type OrganizationReview = z.infer<typeof organizationReviewSchema>
