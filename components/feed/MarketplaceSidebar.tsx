'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell, MessageCircle, Plus, ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'

const navigation = [
  { label: 'Discover', href: '/marketplace' },
  { label: 'My bookings', href: '/marketplace/bookings' },
  { label: 'Saved', href: '/marketplace/saved' },
  { label: 'My assets', href: '/marketplace/listing' },
  { label: 'Dashboard', href: '/marketplace/dashboard' },
]

// Compatibility name: existing imports now receive a top navigation, never a sidebar.
export function MarketplaceSidebar() {
  const pathname = usePathname()
  return (
    <header className="sticky top-0 z-50 border-b border-border-subtle bg-background-app/95 backdrop-blur-xl">
      <div className="mx-auto flex h-[76px] max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-10">
        <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="Rentral home">
          <Image src="/Rentral.svg" alt="" width={30} height={32} className="h-8 w-auto brightness-0 invert" />
          <span className="text-xl font-bold tracking-tight">rentral<span className="text-accent-hover">.</span></span>
        </Link>
        <nav aria-label="Main navigation" className="hidden items-center gap-1 lg:flex">
          {navigation.map(item => {
            const active = pathname === item.href || (item.href !== '/marketplace' && pathname.startsWith(`${item.href}/`))
            return <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined}
              className={cn('rounded-full px-3.5 py-2.5 text-xs font-medium transition-colors hover:bg-glass-light hover:text-text-primary focus-visible:outline-2 focus-visible:outline-accent-primary', active ? 'bg-glass-light text-text-primary' : 'text-text-muted')}>
              {item.label}
            </Link>
          })}
        </nav>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <Link href="/marketplace/messages" aria-label="Inbox" className="flex h-10 w-10 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-glass-light focus-visible:outline-2 focus-visible:outline-accent-primary"><MessageCircle className="h-[19px] w-[19px]" /></Link>
          <Link href="/marketplace/notifications" aria-label="Notifications" className="hidden h-10 w-10 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-glass-light focus-visible:outline-2 focus-visible:outline-accent-primary sm:flex"><Bell className="h-[19px] w-[19px]" /></Link>
          <Link href="/marketplace/listing/create" className="inline-flex items-center gap-2 rounded-full bg-accent-primary px-3 py-2.5 text-xs font-bold text-text-inverse transition-all hover:bg-accent-hover active:scale-95 sm:px-4"><Plus className="h-4 w-4" /><span className="hidden sm:inline">List an asset</span><span className="sr-only sm:hidden">List an asset</span></Link>
          <Link href="/marketplace/profile" className="hidden h-10 items-center gap-1 rounded-full border border-border-subtle px-3 text-xs font-semibold transition-colors hover:bg-glass-light lg:inline-flex">Profile<ArrowUpRight className="h-3.5 w-3.5" /></Link>
        </div>
      </div>
    </header>
  )
}
