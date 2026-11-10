import { rentralMark } from '@/lib/brand/mark'
import { cn } from '@/lib/utils'

/** Shared vector geometry; surrounding links provide their own accessible label. */
export function RentralLogo({ className }: { className?: string }) {
  return <span role="img" aria-label="Rentral" className={cn('inline-flex shrink-0 items-center gap-2.5 whitespace-nowrap leading-none', className)}>
    <svg aria-hidden="true" viewBox={rentralMark.viewBox} fill="currentColor" className="size-[1.15em] shrink-0 text-accent-hover"><path d={rentralMark.path} /></svg>
    <span aria-hidden="true" className="font-semibold tracking-[-0.055em]">rentral</span>
  </span>
}
