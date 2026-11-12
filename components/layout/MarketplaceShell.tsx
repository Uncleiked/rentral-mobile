import type { ReactNode } from 'react'
import { MarketplaceSidebar } from '@/components/feed/MarketplaceSidebar'
import { MarketplaceBottomNav } from '@/components/feed/MarketplaceBottomNav'
import { cn } from '@/lib/utils'

type Props = { children: ReactNode; className?: string }

export function MarketplaceShell({ children, className }: Props) {
  return (
    <div className="min-h-dvh min-w-0 bg-background-app text-text-primary">
      <a href="#marketplace-content" className="sr-only z-[80] rounded-xl bg-accent-primary px-4 py-3 text-text-inverse focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Skip to content</a>
      <MarketplaceSidebar />
      <main id="marketplace-content" className={cn('mx-auto w-full max-w-[1440px] min-w-0 px-4 py-6 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-8 sm:pb-[calc(6rem+env(safe-area-inset-bottom))] lg:px-10 xl:pb-12', className)}>
        {children}
      </main>
      <MarketplaceBottomNav />
    </div>
  )
}
