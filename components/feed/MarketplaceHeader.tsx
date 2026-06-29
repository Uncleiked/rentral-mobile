import clsx from "clsx";
import { Search, SlidersHorizontal } from "lucide-react";

export function MarketplaceHeader() {
  return (
    <div className={clsx('w-full', 'py-4', 'px-4', 'md:px-0', 'flex', 'items-center', 'gap-3', 'sticky', 'top-0', 'z-50', 'bg-background-app', 'border-b', 'border-border-subtle', 'mb-4')}>
      {/* Filter Icon */}
      <button
        type="button"
        className={clsx('flex', 'h-10', 'w-10', 'items-center', 'justify-center', 'rounded-full', 'bg-surface-card', 'border', 'border-border-subtle', 'text-text-primary', 'flex-shrink-0', 'hover:bg-[#262626]', 'transition-all')}
        aria-label="Filter listings"
      >
        <SlidersHorizontal className="h-5 w-5" />
      </button>

      {/* Search Bar */}
      <div className={clsx('relative', 'flex-1')}>
        <div className={clsx('absolute', 'inset-y-0', 'left-0', 'pl-3', 'flex', 'items-center', 'pointer-events-none')}>
          <Search className="h-5 w-5 text-text-muted" />
        </div>
        <input
          type="text"
          placeholder="Search areas, assets..."
          className={clsx(
            'block', 'w-full', 'pl-10', 'pr-3', 'py-2.5',
            'bg-surface-card', 'border', 'border-border-subtle', 'rounded-xl',
            'text-sm', 'text-text-primary', 'placeholder:text-text-muted',
            'focus:outline-none', 'focus:ring-1', 'focus:ring-accent-primary', 'focus:border-accent-primary', 'transition-all'
          )}
        />
      </div>
    </div>
  );
}
