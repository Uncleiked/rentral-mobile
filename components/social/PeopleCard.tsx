'use client'
import Link from 'next/link'
import Image from 'next/image'
import { useState } from 'react'
import { MessageCircle } from 'lucide-react'
import type { SocialPerson } from '@/lib/contracts/social'
import { FollowButton } from './FollowButton'
export function PeopleCard({person:initial,actorId,onChange}:{person:SocialPerson;actorId:string;onChange?:(person:SocialPerson)=>void}){
 const [person,setPerson]=useState(initial)
 const name=person.username?'@'+person.username:person.displayName
 return <article className="flex min-w-0 flex-wrap items-start gap-4 rounded-2xl border border-border-subtle bg-surface-card p-4 sm:p-5"><span className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border-subtle bg-background-app text-lg font-semibold">{person.avatarUrl?<Image src={person.avatarUrl} alt="" fill sizes="48px" className="object-cover"/>:person.displayName.charAt(0).toUpperCase()}</span><div className="min-w-0 flex-1 basis-40">{person.username?<Link href={'/marketplace/profile/'+encodeURIComponent(person.username)} className="inline-flex min-h-11 max-w-full items-center break-words text-sm font-semibold hover:text-accent-hover">{name}</Link>:<p className="break-words text-sm font-semibold">{name}</p>}<p className="break-words text-sm text-text-secondary">{person.displayName}</p><p className="mt-2 text-xs leading-5 text-text-muted">{person.accountType==='organization'?'Organization':'Individual'}{person.followedBy?' - Follows you':''}</p></div><div className="flex min-w-0 flex-wrap items-start gap-2"><FollowButton person={person} actorId={actorId} onChange={next=>{setPerson(next);onChange?.(next)}}/>{person.id!==actorId&&!person.blocked&&<Link href={'/marketplace/messages?user='+person.id} aria-label={'Message '+name} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border-subtle px-3 py-2 text-text-secondary hover:bg-glass-light focus-visible:outline-2 focus-visible:outline-accent-primary"><MessageCircle className="size-4" aria-hidden="true"/></Link>}</div></article>
}
