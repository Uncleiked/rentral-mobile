import { requireApiIdentity } from '@/lib/api/auth'
import { apiSuccess } from '@/lib/api/http'
import { adminFailure } from '@/lib/api/admin'
import { adminOverview } from '@/lib/operations/admin-overview'
export const runtime='nodejs'
export async function GET(request:Request):Promise<Response>{try{const identity=await requireApiIdentity(request,{admission:false,platform:true});return apiSuccess(await adminOverview(identity.userId))}catch(error){return adminFailure(error,'admin-overview')}}
