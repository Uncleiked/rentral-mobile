'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Bell, MessageCircle, Plus, ArrowUpRight, Menu, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { RentralLogo } from '@/components/brand/RentralLogo'

const navigation = [
  { label: 'Discover', href: '/marketplace' },
  { label: 'My bookings', href: '/marketplace/bookings' },
  { label: 'Saved', href: '/marketplace/saved' },
  { label: 'My assets', href: '/marketplace/listing' },
  { label: 'Dashboard', href: '/marketplace/dashboard' },
]
const compactNavigation = [
  ...navigation,
  { label: 'Inbox', href: '/marketplace/messages' },
  { label: 'Notifications', href: '/marketplace/notifications' },
  { label: 'Profile', href: '/marketplace/profile' },
]
const actionClass = 'inline-flex size-11 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-glass-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-hover'

// Compatibility name: existing imports now receive a top navigation, never a sidebar.
export function MarketplaceSidebar() {
  const pathname = usePathname()
  const [menuPath, setMenuPath] = useState<string | null>(null)
  const menuOpen = menuPath === pathname
  const headerRef = useRef<HTMLElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setMenuPath(null)
      toggleRef.current?.focus()
    }
    function closeOutside(event: PointerEvent) {
      if (event.target instanceof Node && !headerRef.current?.contains(event.target)) setMenuPath(null)
    }
    document.addEventListener('keydown', closeOnEscape)
    document.addEventListener('pointerdown', closeOutside)
    return () => {
      document.removeEventListener('keydown', closeOnEscape)
      document.removeEventListener('pointerdown', closeOutside)
    }
  }, [menuOpen])

  function activeLink(href: string) {
    return pathname === href || (href !== '/marketplace' && pathname.startsWith(`${href}/`))
  }

  return (
    <header ref={headerRef} className="sticky top-0 z-50 border-b border-border-subtle bg-background-app/95 text-text-primary backdrop-blur-xl">
      <div className="mx-auto flex min-h-[76px] w-full max-w-[1440px] min-w-0 items-center justify-between gap-2 px-4 sm:gap-4 sm:px-6 lg:px-10">
        <Link href="/" className="inline-flex min-h-11 shrink-0 items-center rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-hover" aria-label="Rentral home">
          <RentralLogo className="text-xl" />
        </Link>
        <nav aria-label="Main navigation" className="hidden min-w-0 items-center gap-1 xl:flex">
          {navigation.map(item => <Link key={item.href} href={item.href} aria-current={activeLink(item.href) ? 'page' : undefined}
            className={cn('inline-flex min-h-11 items-center rounded-full px-3.5 text-xs font-medium transition-colors hover:bg-glass-light hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-hover', activeLink(item.href) ? 'bg-glass-light text-text-primary' : 'text-text-muted')}>
            {item.label}
          </Link>)}
        </nav>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <Link href="/marketplace/messages" aria-label="Inbox" className={actionClass}><MessageCircle className="size-5" /></Link>
          <Link href="/marketplace/notifications" aria-label="Notifications" className={cn(actionClass, 'hidden sm:inline-flex')}><Bell className="size-5" /></Link>
          <Link href="/marketplace/listing/create" className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-full bg-accent-primary px-3 text-xs font-semibold text-text-inverse transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-hover sm:px-4"><Plus className="size-4" /><span className="hidden sm:inline">List an asset</span><span className="sr-only sm:hidden">List an asset</span></Link>
          <Link href="/marketplace/profile" className="hidden min-h-11 items-center gap-1 rounded-full border border-border-subtle px-3 text-xs font-semibold transition-colors hover:bg-glass-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-hover xl:inline-flex">Profile<ArrowUpRight className="size-3.5" /></Link>
          <button ref={toggleRef} type="button" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen} aria-controls="marketplace-compact-navigation" onClick={() => setMenuPath(menuOpen ? null : pathname)} className={cn(actionClass, 'xl:hidden')}>{menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}</button>
        </div>
      </div>
      {menuOpen && <nav id="marketplace-compact-navigation" aria-label="Additional navigation" className="border-t border-border-subtle xl:hidden"><div className="mx-auto grid w-full max-w-[1440px] grid-cols-2 gap-2 px-4 py-4 sm:grid-cols-4 sm:px-6 lg:px-10">{compactNavigation.map(item => <Link key={item.href} href={item.href} onClick={() => setMenuPath(null)} aria-current={activeLink(item.href) ? 'page' : undefined} className={cn('inline-flex min-h-11 min-w-0 items-center rounded-xl px-3 py-2 text-sm font-medium transition-colors hover:bg-glass-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-hover', activeLink(item.href) ? 'bg-glass-light text-text-primary' : 'text-text-secondary')}>{item.label}</Link>)}</div></nav>}
    </header>
  )
}
