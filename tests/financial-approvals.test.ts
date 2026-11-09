import { describe, expect, it } from 'vitest'
import { independentApprover } from '@/lib/payments/financial-core'

describe('independent approval for booking and non-booking sources', () => {
  it('rejects a staff payer approving a refund requested by different staff for a commercial or listing-fee source', () => {
    expect(independentApprover('payer', { requested_by: 'requester', participant_ids: ['payer'] }, null)).toBe(false)
  })
  it('requires an approver independent of both requester and persisted source participants', () => {
    const operation = { requested_by: 'requester', participant_ids: ['payer', 'host'] }
    expect(independentApprover('requester', operation, null)).toBe(false)
    expect(independentApprover('host', operation, null)).toBe(false)
    expect(independentApprover('independent-finance', operation, null)).toBe(true)
  })
})
