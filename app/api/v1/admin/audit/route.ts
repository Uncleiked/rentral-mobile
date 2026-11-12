import { requireApiIdentity } from '@/lib/api/auth'
import { apiSuccess, apiSearchParams } from '@/lib/api/http'
import { adminFailure } from '@/lib/api/admin'
import { searchAdminAudit } from '@/lib/operations/admin-history'
export const runtime='nodejs'
export async function GET(request:Request):Promise<Response>{try{const identity=await requireApiIdentity(request,{admission:false,platform:true});return apiSuccess(await searchAdminAudit(identity.userId,apiSearchParams(request)))}catch(error){return adminFailure(error,'admin-audit')}}
