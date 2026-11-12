import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import prisma from '@/lib/db'
import { ApiError } from '@/lib/api/http'
import { currentStaffRole } from '@/lib/auth/roles'
import { permissionsForRole, type StaffPermission } from '@/lib/auth/roles-policy'
import { assertOwnerAdminReady } from '@/lib/database/readiness'
import { adminOverviewSchema } from '@/lib/contracts/admin-operations'
const result=z.array(z.object({count:z.number().int().nonnegative().safe(),oldestAt:z.string().datetime().nullable()}).passthrough()).max(1)
type Query=(pipeline:Prisma.InputJsonObject[])=>PromiseLike<unknown>
export function queueOverviewPipeline(filter:Prisma.InputJsonObject,date:string):Prisma.InputJsonObject[]{return [{$match:filter},{$group:{_id:null,count:{$sum:1},oldestAt:{$min:'$'+date}}},{$project:{_id:0,count:1,oldestAt:{$dateToString:{date:'$oldestAt',format:'%Y-%m-%dT%H:%M:%S.%LZ',timezone:'UTC',onNull:null}}}}]}
export async function adminOverview(actorId:string){
  await assertOwnerAdminReady()
  const role=await currentStaffRole(actorId),permissions=permissionsForRole(role)
  if(!permissions.includes('staff:workspace'))throw new ApiError(403,'STAFF_REQUIRED','Staff workspace access is required.')
  const specs:{id:string;label:string;permission:StaffPermission;href:string;tab:string|null;filter:Prisma.InputJsonObject;date:string;query:Query}[]=[
    {id:'listings',label:'Listings awaiting review',permission:'listing:review',href:'/admin',tab:'listings',filter:{listing_status:'pending_verification',publication_mode:{$ne:'trusted_publisher'},archived_at:null},date:'createdAt',query:pipeline=>prisma.listing.aggregateRaw({pipeline,options:{maxTimeMS:5000}})},
    {id:'organizations',label:'Organization applications',permission:'user:manage',href:'/admin',tab:'organizations',filter:{status:'pending'},date:'submitted_at',query:pipeline=>prisma.organizationApplication.aggregateRaw({pipeline,options:{maxTimeMS:5000}})},
    {id:'inspections',label:'Manual inspection evidence',permission:'inspection:review',href:'/admin',tab:'inspections',filter:{manual_inspection_status:'pending',manual_inspection_requested_at:{$type:'date'},manual_inspection_requested_by:{$type:'string'}},date:'manual_inspection_requested_at',query:pipeline=>prisma.booking.aggregateRaw({pipeline,options:{maxTimeMS:5000}})},
    {id:'reports',label:'Open booking reports',permission:'dispute:review',href:'/marketplace/admin',tab:null,filter:{status:'open'},date:'createdAt',query:pipeline=>prisma.dispute.aggregateRaw({pipeline,options:{maxTimeMS:5000}})},
    {id:'appeals',label:'Safety notice appeals',permission:'safety:review',href:'/marketplace/admin',tab:null,filter:{status:'pending'},date:'createdAt',query:pipeline=>prisma.safetyAppeal.aggregateRaw({pipeline,options:{maxTimeMS:5000}})},
    {id:'renewals',label:'Renewal evidence reviews',permission:'renewal:review',href:'/marketplace/admin/lifecycle',tab:null,filter:{status:'pending_review'},date:'createdAt',query:pipeline=>prisma.renewal.aggregateRaw({pipeline,options:{maxTimeMS:5000}})},
    {id:'terminations',label:'Lease termination reviews',permission:'termination:review',href:'/marketplace/admin/lifecycle',tab:null,filter:{status:'pending_review'},date:'createdAt',query:pipeline=>prisma.leaseTermination.aggregateRaw({pipeline,options:{maxTimeMS:5000}})},
  ]
  const queues=await Promise.all(specs.filter(spec=>permissions.includes(spec.permission)).map(async spec=>{const data=result.parse(await spec.query(queueOverviewPipeline(spec.filter,spec.date)))[0];return {id:spec.id,label:spec.label,href:spec.href,tab:spec.tab,count:data?.count??0,oldestAt:data?.oldestAt??null}}))
  if(await currentStaffRole(actorId)!==role)throw new ApiError(403,'STAFF_REQUIRED','Staff access changed. Refresh the workspace.')
  return adminOverviewSchema.parse({generatedAt:new Date().toISOString(),queues})
}
