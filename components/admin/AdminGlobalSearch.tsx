'use client'

import { useRef, useState } from 'react'
import { Search, ArrowUpRight, Layers3, UsersRound, Building2, FileClock } from 'lucide-react'
import { adminUsersSchema, type AdminListing, type AdminUser } from '@/lib/contracts/admin'
import { adminListingPageSchema } from '@/lib/contracts/admin-search'
import { organizationQueuePageSchema } from '@/lib/contracts/organizations'
import { adminAuditPageSchema } from '@/lib/contracts/admin-operations'
import { listingRequest } from '@/lib/listings/capture-client'
import type { AdminTab } from './admin-view'

type Category = 'listings' | 'members' | 'organizations' | 'audit'
type Result = { id: string; title: string; description: string; listing?: AdminListing; user?: AdminUser }
type Group = { category: Category; items: Result[]; total: number | null; more: boolean; error?: string }
const categories = [
  { id: 'listings', label: 'Listings', description: 'Title, address, host username, email or listing ID', icon: Layers3 },
  { id: 'members', label: 'Members', description: 'Username, email prefix or exact account ID', icon: UsersRound },
  { id: 'organizations', label: 'Organizations', description: 'Business name, registration number or representative', icon: Building2 },
  { id: 'audit', label: 'Decisions', description: 'Staff, action, target or decision reason', icon: FileClock },
] as const
const field='mt-2 block min-h-11 w-full min-w-0 rounded-xl border border-border-subtle bg-background-app p-3 text-base text-text-primary focus-visible:outline-2 focus-visible:outline-accent-primary sm:text-sm'
const button='inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border-subtle px-4 py-3 text-sm font-semibold hover:bg-glass-light focus-visible:outline-2 focus-visible:outline-accent-primary disabled:cursor-not-allowed disabled:opacity-50'
export function AdminGlobalSearch({ actorId, tabs, disabled, onOpen, onListing, onMember }: {
 actorId:string; tabs: readonly { id: AdminTab }[]; disabled:boolean
 onOpen:(category:Category,query:string)=>void; onListing:(listing:AdminListing)=>void; onMember:(member:AdminUser)=>void
}) {
 const available=categories.filter(category=>tabs.some(tab=>tab.id===category.id))
 const [query,setQuery]=useState(''),[category,setCategory]=useState<'all'|Category>('all')
 const [searched,setSearched]=useState(''),[groups,setGroups]=useState<Group[]|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState('')
 const sequence=useRef(0)
 async function search() {
  const term=query.trim(), request=++sequence.current
  if (!term) {setError('Enter a username, email, listing, business or decision to search.');return}
  setLoading(true);setError('');setGroups(null);setSearched(term)
  const selected=available.filter(item=>category==='all'||item.id===category)
  const result=await Promise.allSettled(selected.map(async (item: typeof categories[number]):Promise<Group>=>{
   if(item.id==='listings'){
    const data=await listingRequest(actorId,'/api/v1/admin/listings?'+new URLSearchParams({query:term,status:'all',archived:'include',limit:'5'}),adminListingPageSchema)
    return {category:item.id,items:data.items.map(row=>({id:row.id,title:row.title,description:row.address+' · '+row.status+(row.lister.username?' · @'+row.lister.username:''),listing:row})),total:data.total,more:data.hasMore}
   }
   if(item.id==='members'){
    const data=await listingRequest(actorId,'/api/v1/admin/users?'+new URLSearchParams({query:term}),adminUsersSchema)
    return {category:item.id,items:data.items.slice(0,5).map(row=>({id:row.id,title:row.username?'@'+row.username:row.email,description:row.email+' · '+row.role,user:row})),total:data.items.length<50?data.items.length:null,more:data.items.length>5}
   }
   if(item.id==='organizations'){
    const data=await listingRequest(actorId,'/api/v1/admin/organizations?'+new URLSearchParams({query:term,status:'all',limit:'5'}),organizationQueuePageSchema)
    return {category:item.id,items:data.items.map(row=>({id:row.id,title:row.legalName,description:row.registrationNumber+' · '+row.status})),total:data.total,more:data.hasMore}
   }
   const data=await listingRequest(actorId,'/api/v1/admin/audit?'+new URLSearchParams({query:term,limit:'5'}),adminAuditPageSchema)
   return {category:item.id,items:data.items.map(row=>({id:row.id,title:row.action.replaceAll('_',' '),description:row.reason})),total:data.total,more:data.hasMore}
  }))
  if(request!==sequence.current)return
  setGroups(result.map((value,index)=>value.status==='fulfilled'?value.value:{category:selected[index].id,items:[],total:null,more:false,error:value.reason instanceof Error?value.reason.message.slice(0,500):'This category could not be searched.'}))
  setLoading(false)
 }
 if (!available.length) return null
 return <section aria-label="Search all administration" className="mt-6 min-w-0 rounded-2xl border border-border-subtle bg-surface-card p-5 sm:p-6">
  <div className="flex items-center gap-2"><Search className="size-5 shrink-0 text-accent-hover" aria-hidden="true"/><h2 className="font-semibold">Find anything in administration</h2></div>
  <p className="mt-2 text-sm leading-6 text-text-muted">Search across the workspaces available to your role, then open a record or refine its filters.</p>
  <form className="mt-4 grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:items-end" onSubmit={event=>{event.preventDefault();void search()}}>
   <label className="min-w-0 text-xs text-text-muted">Search administration<input type="search" value={query} onChange={event=>setQuery(event.target.value)} disabled={disabled||loading} maxLength={254} className={field} placeholder="Username, email, listing, business or decision"/></label>
   <label className="min-w-0 text-xs text-text-muted">Category<select value={category} disabled={disabled||loading} onChange={event=>setCategory(event.target.value as typeof category)} className={field}><option value="all">All categories</option>{available.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
   <button type="submit" className={button} disabled={disabled||loading}>{loading?'Searching…':'Search'}</button>
  </form>
  {error&&<p role="alert" className="mt-3 text-sm text-trust-flagged">{error}</p>}
  {loading&&<p role="status" className="mt-4 text-sm text-text-muted">Searching permitted records…</p>}
  {groups&&<div className="mt-5 space-y-5"><p role="status" className="text-xs text-text-muted">Results for “{searched}”</p>{groups.map(group=>{
   const info=categories.find(item=>item.id===group.category)!
   return <section key={group.category} aria-label={info.label+' search results'} className="min-w-0 border-t border-border-subtle pt-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">{info.label}{group.total!==null?' · '+group.total:''}</h3><button type="button" className={button} disabled={disabled} onClick={()=>onOpen(group.category,searched)}>Open {info.label.toLowerCase()} <ArrowUpRight className="size-4" aria-hidden="true"/></button></div>
    {group.error?<p role="alert" className="mt-3 break-words text-sm text-trust-flagged">{group.error} Use the category workspace to retry.</p>:!group.items.length?<p className="mt-3 text-sm text-text-muted">No matches. {info.description}.</p>:<ul className="mt-3 space-y-2">{group.items.map(item=><li key={item.id}><button type="button" disabled={disabled} onClick={()=>item.listing?onListing(item.listing):item.user?onMember(item.user):onOpen(group.category,searched)} className="flex min-h-11 w-full min-w-0 items-start justify-between gap-3 rounded-xl border border-border-subtle bg-background-app px-4 py-3 text-left hover:border-accent-primary focus-visible:outline-2 focus-visible:outline-accent-primary disabled:opacity-50"><span className="min-w-0"><span className="block break-words text-sm font-medium">{item.title}</span><span className="mt-1 block line-clamp-2 break-words text-xs leading-5 text-text-muted">{item.description}</span></span><ArrowUpRight className="mt-1 size-4 shrink-0 text-text-muted" aria-hidden="true"/></button></li>)}</ul>}
    {group.more&&<p className="mt-2 text-xs leading-5 text-text-muted">More matches are available in this category.</p>}
   </section>
  })}<button type="button" className={button} onClick={()=>{sequence.current+=1;setGroups(null);setQuery('');setSearched('');setError('')}}>Clear search results</button></div>}
 </section>
}



