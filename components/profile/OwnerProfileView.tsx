import Link from 'next/link'
import { ArrowUpRight, CalendarDays, Heart, LayoutDashboard, Plus } from 'lucide-react'
import { OwnerProfileHeader } from '@/components/profile/OwnerProfileHeader'
import { ListingsGrid } from '@/components/profile/ListingsGrid'
import { SecurityCard } from '@/components/profile/SecurityCard'
import { AccountLifecycleCard } from '@/components/account/AccountLifecycleCard'
import { getListingsForProfile, type OwnProfileDetails } from '@/lib/profile-data'
import { SafetyNoticeBanner } from '@/components/trust/SafetyNoticeBanner'

type Props = { profile: OwnProfileDetails }
const shortcuts = [
  { href: '/marketplace/bookings', label: 'My bookings', description: 'Your requests and upcoming plans', icon: CalendarDays },
  { href: '/marketplace/saved', label: 'Saved finds', description: 'Keep your next move close', icon: Heart },
  { href: '/marketplace/dashboard', label: 'Activity', description: 'Your actual marketplace records', icon: LayoutDashboard },
]

export async function OwnerProfileView({ profile }: Props) {
  const listings = await getListingsForProfile(profile.id, { includeDrafts: true })
  return <div className="space-y-9">
    <OwnerProfileHeader profile={profile} />
    <SafetyNoticeBanner subjectId={profile.id} owner />
    <Link href="/marketplace/appeals" className="inline-flex min-h-11 items-center text-sm text-text-muted underline underline-offset-4 hover:text-text-primary">Safety notices & appeals</Link>
    <div className="grid gap-3 sm:grid-cols-3">{shortcuts.map(item => <Link key={item.href} href={item.href} className="group flex flex-col rounded-2xl border border-border-subtle bg-surface-card p-5 transition-colors hover:border-glass-border-medium"><div className="mb-5 flex items-center justify-between"><item.icon className="h-5 w-5 text-accent-hover" /><ArrowUpRight className="h-4 w-4 text-text-muted group-hover:text-text-primary" /></div><span className="text-sm font-semibold">{item.label}</span><span className="mt-1 text-xs leading-relaxed text-text-muted">{item.description}</span></Link>)}</div>
    <section><div className="mb-5 flex items-center justify-between gap-4"><div><h2 className="text-lg font-semibold">Your assets</h2><p className="mt-1 text-xs text-text-muted">{listings.length} listing{listings.length === 1 ? '' : 's'}, including your private drafts.</p></div><Link href="/marketplace/listing/create" className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle px-4 py-2.5 text-xs font-semibold hover:bg-glass-light"><Plus className="h-3.5 w-3.5" />Create</Link></div><ListingsGrid listings={listings} owner /></section>
    <SecurityCard key={profile.id} userId={profile.id} />
    <AccountLifecycleCard key={`lifecycle:${profile.id}`} userId={profile.id} />
  </div>
}
