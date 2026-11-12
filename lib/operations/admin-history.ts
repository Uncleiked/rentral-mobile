import { escapeAdminText } from '@/lib/admin/search'
import { createHash } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import prisma from '@/lib/db'
import { ApiError } from '@/lib/api/http'
import { hasStaffPermission } from '@/lib/auth/roles'
import { assertOwnerAdminReady } from '@/lib/database/readiness'
import { adminAuditPageSchema, adminAuditSearchSchema } from '@/lib/contracts/admin-operations'
const cursorSchema=z.object({id:z.uuid(),at:z.string().datetime(),filter:z.string().regex(/^[a-f0-9]{64}$/)}).strict()
export async function searchAdminAudit(actorId:string,value:unknown){
  await assertOwnerAdminReady()
  const allowed=async()=>{if(!await hasStaffPermission(actorId,'operations:read'))throw new ApiError(403,'STAFF_REQUIRED','Audit history permission is required.')}
  await allowed()
  const input=adminAuditSearchSchema.parse(value)
  const signature=createHash('sha256').update(JSON.stringify({query:input.query.toLowerCase(),targetType:input.targetType,from:input.from??null,to:input.to??null,sort:input.sort})).digest('hex')
  let cursor:z.infer<typeof cursorSchema>|null=null
  if(input.cursor){try{cursor=cursorSchema.parse(JSON.parse(Buffer.from(input.cursor,'base64url').toString('utf8')));if(cursor.filter!==signature)throw new Error('Filter changed')}catch{throw new ApiError(400,'INVALID_CURSOR','These audit filters changed. Start the search again.')}}
  const terms:Prisma.AdminAuditWhereInput[]=[]
  if(input.targetType!=='all')terms.push({target_type:input.targetType})
  if(input.from||input.to)terms.push({createdAt:{...(input.from?{gte:new Date(input.from+'T00:00:00Z')}:{}) ,...(input.to?{lt:new Date(new Date(input.to+'T00:00:00Z').getTime()+86400000)}:{})}})
  if(input.query){const text={contains:escapeAdminText(input.query),mode:'insensitive' as const};const handle={...text,contains:escapeAdminText(input.query.startsWith('@')&&input.query.length>1?input.query.slice(1):input.query)};terms.push({OR:[{action:text},{reason:text},{target_id:text},{actor_id:text},{actor:{is:{OR:[{username:handle},{email:text}]}}}]})}
  const where:Prisma.AdminAuditWhereInput={AND:terms}
  const direction=input.sort==='oldest'?'asc':'desc'
  const pageWhere:Prisma.AdminAuditWhereInput=cursor?{AND:[where,{OR:[{createdAt:{[direction==='asc'?'gt':'lt']:new Date(cursor.at)}},{createdAt:new Date(cursor.at),id:{[direction==='asc'?'gt':'lt']:cursor.id}}]}]}:where
  const [rows,total]=await Promise.all([prisma.adminAudit.findMany({where:pageWhere,orderBy:[{createdAt:direction},{id:direction}],take:input.limit+1,select:{id:true,actor_id:true,action:true,target_type:true,target_id:true,reason:true,createdAt:true,actor:{select:{username:true}}}}),prisma.adminAudit.count({where})])
  await allowed()
  const page=rows.slice(0,input.limit),last=page.at(-1),hasMore=rows.length>input.limit
  return adminAuditPageSchema.parse({items:page.map(row=>({id:row.id,actorId:row.actor_id,actorUsername:row.actor?.username??null,action:row.action,targetType:row.target_type,targetId:row.target_id,reason:row.reason,createdAt:row.createdAt.toISOString()})),total,hasMore,nextCursor:hasMore&&last?Buffer.from(JSON.stringify({id:last.id,at:last.createdAt.toISOString(),filter:signature})).toString('base64url'):null})
}
