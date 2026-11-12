/** Administrative grant evidence stays separate from login and gallery permission. */
type Evidence = { allowed?: boolean | null; by?: string | null; at?: Date | string | null; reason?: string | null }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export function validPublicationGrant(value: Evidence): boolean {
  return value.allowed === true && Boolean(value.by && uuid.test(value.by) && value.at && Number.isFinite(new Date(value.at).getTime()) && value.reason && value.reason.trim().length >= 15)
}
export type PublicationGrantAccount = {
  listing_fee_exempt?: boolean | null; listing_fee_exempt_by?: string | null; listing_fee_exempt_at?: Date | string | null; listing_fee_exempt_reason?: string | null
  direct_publish_allowed?: boolean | null; direct_publish_by?: string | null; direct_publish_at?: Date | string | null; direct_publish_reason?: string | null
}
export function freePostingGranted(account: PublicationGrantAccount | null | undefined): boolean {
  return Boolean(account && validPublicationGrant({ allowed: account.listing_fee_exempt, by: account.listing_fee_exempt_by, at: account.listing_fee_exempt_at, reason: account.listing_fee_exempt_reason }))
}
export function directPublishingGranted(account: PublicationGrantAccount | null | undefined): boolean {
  return Boolean(account && validPublicationGrant({ allowed: account.direct_publish_allowed, by: account.direct_publish_by, at: account.direct_publish_at, reason: account.direct_publish_reason }))
}
