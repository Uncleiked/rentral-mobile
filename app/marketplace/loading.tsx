import { Skeleton } from "@/components/ui/skeleton";
import clsx from "clsx";

export default function MarketplaceLoading() {
  return (
    <div className={clsx('h-[100dvh]', 'w-full', 'bg-background-app', 'relative', 'overflow-hidden')}>
      <div className={clsx('mx-auto', 'h-full', 'w-full', 'max-w-md', 'relative')}>
        {/* Header Skeleton */}
        <div className={clsx('absolute', 'top-0', 'left-0', 'right-0', 'z-50', 'p-4', 'flex', 'gap-3')}>
          <Skeleton className={clsx('h-12', 'flex-1', 'rounded-xl', 'bg-glass-light')} />
          <Skeleton className={clsx('h-12', 'w-12', 'rounded-full', 'bg-glass-light')} />
        </div>

        {/* Action Buttons Skeleton (Right side) */}
        <div className={clsx('absolute', 'bottom-32', 'right-4', 'flex', 'flex-col', 'gap-6', 'z-40')}>
          <Skeleton className={clsx('h-12', 'w-12', 'rounded-full', 'bg-glass-light')} />
          <Skeleton className={clsx('h-12', 'w-12', 'rounded-full', 'bg-glass-light')} />
          <Skeleton className={clsx('h-12', 'w-12', 'rounded-full', 'bg-glass-light')} />
        </div>

        {/* Info Area Skeleton (Bottom Left) */}
        <div className={clsx('absolute', 'bottom-8', 'left-4', 'flex', 'flex-col', 'gap-3', 'z-40', 'w-2/3')}>
          <div className={clsx('flex', 'items-center', 'gap-2')}>
            <Skeleton className={clsx('h-10', 'w-10', 'rounded-full', 'bg-glass-light')} />
            <Skeleton className={clsx('h-5', 'w-24', 'rounded-md', 'bg-glass-light')} />
          </div>
          <div className={clsx('flex', 'gap-2')}>
            <Skeleton className={clsx('h-6', 'w-16', 'rounded-full', 'bg-glass-light')} />
            <Skeleton className={clsx('h-6', 'w-20', 'rounded-full', 'bg-glass-light')} />
          </div>
          <Skeleton className={clsx('h-7', 'w-3/4', 'rounded-md', 'bg-glass-light')} />
          <Skeleton className={clsx('h-8', 'w-1/3', 'rounded-md', 'bg-glass-light')} />
        </div>
      </div>
    </div>
  );
}
