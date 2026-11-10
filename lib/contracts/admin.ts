import { z } from 'zod'

const timestamp = z.string().datetime({ offset: true })
export const adminRoleSchema = z.enum(['owner', 'admin', 'moderator', 'finance', 'analyst', 'member'])
export const assignableStaffRoleSchema = z.enum(['admin', 'moderator', 'finance', 'analyst', 'member'])
const commandBase = { clientId: z.uuid(), targetId: z.uuid(), expectedRevision: z.number().int().nonnegative(), reason: z.string().trim().min(15).max(2000) }
const listingBase = { ...commandBase, ownerOverride: z.boolean().optional().default(false) }
const listingCommand = <T extends string>(operation: T) => z.object({ ...listingBase, operation: z.literal(operation) }).strict()
export const adminCommandSchema = z.discriminatedUnion('operation', [
  listingCommand('approve_document'), listingCommand('reject_document'), listingCommand('publish'), listingCommand('suspend_listing'), listingCommand('waive_fee'), listingCommand('revoke_fee_waiver'),
  z.object({ ...commandBase, operation: z.literal('change_role'), role: assignableStaffRoleSchema }).strict(),
  z.object({ ...commandBase, operation: z.literal('set_gallery_permission'), allowed: z.boolean(), ownerOverride: z.boolean().optional().default(false) }).strict(),
  z.object({ ...commandBase, operation: z.literal('suspend_user') }).strict(),
  z.object({ ...commandBase, operation: z.literal('restore_user') }).strict(),
  z.object({ ...commandBase, operation: z.literal('review_manual_inspection'), decision: z.enum(['approve', 'reject']) }).strict(),
  z.object({ ...commandBase, operation: z.literal('transfer_ownership') }).strict(),
]).superRefine((value, context) => {
  if (('ownerOverride' in value && value.ownerOverride || value.operation === 'review_manual_inspection' || value.operation === 'transfer_ownership') && value.reason.length < 30) context.addIssue({ code: 'custom', path: ['reason'], message: 'Provide a detailed reason of at least 30 characters.' })
})
export type AdminCommand = z.infer<typeof adminCommandSchema>
export const adminCommandReceiptSchema = z.object({ clientId: z.uuid(), auditId: z.uuid(), committed: z.literal(true) }).strict()
export const adminUserSchema = z.object({ id: z.uuid(), revision: z.number().int().nonnegative(), email: z.string().email(), username: z.string().max(24).nullable(), role: adminRoleSchema,
  suspended: z.boolean(), closed: z.boolean(), galleryAllowed: z.boolean(), galleryPermissionRevision: z.number().int().nonnegative(), createdAt: timestamp }).strict()
export const adminListingSchema = z.object({ id: z.uuid(), revision: z.number().int().nonnegative(), category: z.enum(['house', 'car', 'boat']), title: z.string().max(200), address: z.string().max(300),
  status: z.string().max(80), source: z.enum(['recorded', 'approved_gallery']), archived: z.boolean(), createdAt: timestamp,
  lister: z.object({ id: z.uuid(), username: z.string().max(24).nullable() }).strict(),
  document: z.object({ present: z.boolean(), status: z.string().max(80), approvalMatches: z.boolean() }).strict(),
  media: z.object({ hasVideo: z.boolean(), photoCount: z.number().int().min(0).max(10), status: z.string().max(80).nullable() }).strict(),
  locationStatus: z.string().max(80).nullable(), fee: z.object({ waived: z.boolean(), paid: z.boolean() }).strict(),
}).strict()
export const adminAuditSchema = z.object({ id: z.uuid(), action: z.string().max(100), targetType: z.string().max(80), targetId: z.string().max(150), reason: z.string().max(2000), actorId: z.uuid().nullable(), createdAt: timestamp }).strict()
export const adminInspectionSchema = z.object({ id: z.uuid(), revision: z.number().int().nonnegative(), listingId: z.uuid(), status: z.enum(['pending', 'approved', 'rejected']), evidence: z.string().max(2000),
  requestedBy: z.uuid(), requestedAt: timestamp, renterId: z.uuid(), hostId: z.uuid(), startsAt: timestamp }).strict()
export const adminDashboardSchema = z.object({ role: adminRoleSchema, permissions: z.array(z.string().max(80)).max(40),
  listings: z.array(adminListingSchema).max(50), users: z.array(adminUserSchema).max(50), inspections: z.array(adminInspectionSchema).max(50), audit: z.array(adminAuditSchema).max(50) }).strict()
export const adminUserSearchSchema = z.object({ query: z.string().trim().max(254).optional().default('') }).strict()
export const adminUsersSchema = z.object({ items: z.array(adminUserSchema).max(50) }).strict()
export const adminDocumentSchema = z.object({ url: z.string().max(3000).url(), expiresAt: timestamp, digest: z.string().regex(/^[a-f0-9]{64}$/) }).strict()
export const manualInspectionRequestSchema = z.object({ clientId: z.uuid(), evidence: z.string().trim().min(30).max(2000) }).strict()
export const manualInspectionSchema = z.object({ bookingId: z.uuid(), eligible: z.boolean(), status: z.enum(['pending', 'approved', 'rejected']).nullable(), evidence: z.string().max(2000).nullable(),
  requestedAt: timestamp.nullable(), reviewedAt: timestamp.nullable(), reviewReason: z.string().max(2000).nullable() }).strict()
export type AdminDashboard = z.infer<typeof adminDashboardSchema>
export type AdminListing = z.infer<typeof adminListingSchema>
export type AdminUser = z.infer<typeof adminUserSchema>
export type AdminCommandReceipt = z.infer<typeof adminCommandReceiptSchema>
export type ManualInspection = z.infer<typeof manualInspectionSchema>
