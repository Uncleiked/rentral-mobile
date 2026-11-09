import { requireApiIdentity } from '@/lib/api/auth'
import { ApiError, apiFailure, apiSuccess } from '@/lib/api/http'
import { financialApiError } from '@/lib/api/financial'
import { financialBanksSchema } from '@/lib/contracts/financial'
import { paystackClientFromEnvironment } from '@/lib/payments/providers/paystack/client'
import { settlementAvailable } from '@/lib/payments/financial-policy'

export const runtime = 'nodejs'
export async function GET(request: Request): Promise<Response> {
  try {
    await requireApiIdentity(request, { platform: true })
    if (!settlementAvailable('payout')) throw new ApiError(503, 'SETTLEMENT_UNAVAILABLE', 'Recipient setup is not enabled for this merchant account.')
    return apiSuccess(financialBanksSchema.parse(await paystackClientFromEnvironment().listBanks(new URL(request.url).searchParams.get('cursor') ?? undefined)))
  } catch (error) { return apiFailure(financialApiError(error), 'financial/banks') }
}
