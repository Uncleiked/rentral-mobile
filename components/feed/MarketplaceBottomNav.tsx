'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Search, Heart, CalendarDays, LayoutGrid, UserRound } from 'lucide-react'
import { cn } from '@/lib/utils'

const items = [
  { label: 'Discover', href: '/marketplace', icon: Search },
  { label: 'Saved', href: '/marketplace/saved', icon: Heart },
  { label: 'Bookings', href: '/marketplace/bookings', icon: CalendarDays },
  { label: 'My assets', href: '/marketplace/listing', icon: LayoutGrid },
  { label: 'Profile', href: '/marketplace/profile', icon: UserRound },
]

export function MarketplaceBottomNav() {
  const pathname = usePathname()
  return (
    <nav aria-label="Mobile navigation" className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t border-border-subtle bg-background-app/95 px-1 pt-2 pb-[max(12px,env(safe-area-inset-bottom))] backdrop-blur-xl xl:hidden">
      {items.map(item => {
        const active = pathname === item.href || (item.href !== '/marketplace' && pathname.startsWith(`${item.href}/`))
        return <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined} className={cn('flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent-primary', active ? 'text-accent-hover' : 'text-text-muted hover:text-text-primary')}><item.icon className="h-[21px] w-[21px]" strokeWidth={active ? 2.2 : 1.6} /><span>{item.label}</span></Link>
      })}
    </nav>
  )
}
