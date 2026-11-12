'use client'

import type { FieldErrors, UseFormRegister } from 'react-hook-form'
import { cn } from '@/lib/utils'
import { listingErrorClass, listingInputClass, listingLabelClass, type ListingFieldValues } from '@/lib/listing-form'
import type { ListingCategory } from '@/store/useRentralStore'

export type ListingMetadataFieldSpec = { kind: 'text' | 'textarea' | 'select' | 'checkbox'; name: string; label: string; placeholder?: string; inputMode?: 'numeric' | 'decimal'; span2?: boolean; maxLength?: number; options?: { value: string; label: string }[] }
type Props = { field: ListingMetadataFieldSpec; category: ListingCategory; register: UseFormRegister<ListingFieldValues>; errors: FieldErrors<ListingFieldValues> }

export function ListingMetadataField({ field, category, register, errors }: Props): React.JSX.Element {
  const id = `${category}-${field.name}`
  const message = errors[field.name]?.message
  const accessibility = { id, 'aria-invalid': Boolean(message), 'aria-describedby': message ? `${id}-error` : undefined }
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', field.span2 && 'sm:col-span-2')}>
      {field.kind === 'checkbox' ? <label htmlFor={id} className="flex min-h-11 items-center gap-3 text-sm text-text-secondary min-w-0 max-w-full"><input {...register(field.name)} {...accessibility} type="checkbox" className="h-4 w-4 shrink-0 rounded border-border-subtle accent-accent-primary" />{field.label}</label> : <>
        <label htmlFor={id} className={listingLabelClass}>{field.label}</label>
        {field.kind === 'select' ? <select {...register(field.name)} {...accessibility} className={listingInputClass}><option value="">Select…</option>{field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : field.kind === 'textarea' ? <textarea {...register(field.name)} {...accessibility} rows={3} placeholder={field.placeholder} maxLength={field.maxLength} className={cn(listingInputClass, 'resize-y')} /> : <input {...register(field.name)} {...accessibility} type="text" inputMode={field.inputMode} pattern={field.inputMode === 'numeric' ? '[0-9]*' : undefined} placeholder={field.placeholder} maxLength={field.maxLength ?? (field.inputMode === 'numeric' ? 9 : 300)} className={listingInputClass} />}
      </>}
      {message && <span id={`${id}-error`} role="alert" className={listingErrorClass}>{String(message)}</span>}
    </div>
  )
}
