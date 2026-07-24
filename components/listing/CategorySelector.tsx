'use client'

import Link from 'next/link'
import { ArrowLeft, Home, Car, Ship } from 'lucide-react'
import { useRentralStore, type ListingCategory } from '@/store/useRentralStore'

const CATEGORIES: { value: ListingCategory; label: string; description: string; icon: typeof Home }[] = [
  { value: 'house', label: 'House', description: 'Apartments, duplexes, shared rooms', icon: Home },
  { value: 'car', label: 'Car', description: 'SUVs, sedans, daily or weekend rentals', icon: Car },
  { value: 'boat', label: 'Boat', description: 'Speedboats, yachts, event charters', icon: Ship },
]

export function CategorySelector() {
  const category = useRentralStore((state) => state.category)
  const setCategory = useRentralStore((state) => state.setCategory)
  const goNext = useRentralStore((state) => state.goNext)

  const handleSelect = (value: ListingCategory) => {
    setCategory(value)
    goNext()
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="mb-8 text-center">
        <h2 className="text-xl font-bold text-text-primary tracking-wide mb-2">
          What are you listing?
        </h2>
        <p className="text-sm text-text-secondary">
          Choose an asset type to start the hardware-locked walkthrough.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {CATEGORIES.map(({ value, label, description, icon: Icon }) => {
          const isSelected = category === value
          return (
            <button
              key={value}
              type="button"
              onClick={() => handleSelect(value)}
              className={`glass-btn flex items-center gap-4 rounded-xl border px-5 py-5 text-left transition-all active:scale-98 ${
                isSelected
                  ? 'border-accent-primary bg-accent-muted'
                  : 'border-border-subtle bg-surface-card'
              }`}
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-glass-border-light bg-glass-light">
                <Icon className="h-5 w-5 text-text-primary" />
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="text-base font-semibold text-text-primary">{label}</span>
                <span className="text-sm font-medium text-text-secondary">{description}</span>
              </span>
            </button>
          )
        })}
      </div>

      <Link
        href="/marketplace/listing"
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-glass-border-medium bg-glass-light px-4 py-3 text-xs font-bold uppercase tracking-wide text-text-primary transition-all active:scale-98"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Your Listings
      </Link>
    </div>
  )
}
