/** A waiver is a recorded administrative decision, never a successful payment. */
export function publicationFeeWaived(value: { fee_waived_at?: Date | string | null; fee_waived_by?: string | null; fee_waiver_reason?: string | null }): boolean {
  return Boolean(value.fee_waived_at && Number.isFinite(new Date(value.fee_waived_at).getTime()) &&
    value.fee_waived_by && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.fee_waived_by) && value.fee_waiver_reason && value.fee_waiver_reason.trim().length >= 15)
}
