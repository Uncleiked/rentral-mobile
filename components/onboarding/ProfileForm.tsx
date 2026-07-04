'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { submitProfile } from '@/app/actions/profile'
import { individualProfileSchema, organizationProfileSchema } from '@/lib/schemas'

// Phone prefix mapping
const COUNTRY_CODES: Record<string, string> = {
  'Nigeria': '+234',
  'Ghana': '+233',
  'Kenya': '+254',
  'South Africa': '+27',
  'United States': '+1',
  'United Kingdom': '+44',
}

export function ProfileForm({ accountType }: { accountType: 'individual' | 'organization' }) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const schema = accountType === 'individual' ? individualProfileSchema : organizationProfileSchema
  
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<any>({
    resolver: zodResolver(schema as any) as any,
    defaultValues: {
      full_name: '',
      date_of_birth: '',
      country: '',
      state: '',
      address: '',
      phone_number: '',
    }
  })

  const selectedCountry = watch('country')

  const handleCountryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newCountry = e.target.value
    setValue('country', newCountry, { shouldValidate: true })
    if (COUNTRY_CODES[newCountry]) {
      setValue('phone_number', COUNTRY_CODES[newCountry], { shouldValidate: true })
    } else {
      setValue('phone_number', '', { shouldValidate: true })
    }
  }

  const onSubmit = async (data: any) => {
    setIsSubmitting(true)
    setError(null)
    try {
      await submitProfile(data)
    } catch (e: any) {
      setError(e.message || 'An error occurred')
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 w-full max-w-md mx-auto">
      <div className="mb-8 text-center">
        <h2 className="text-xl font-bold text-text-primary tracking-wide mb-2">
          {accountType === 'individual' ? 'Personal Details' : 'Company Details'}
        </h2>
        <p className="text-sm text-text-secondary">
          Please provide your accurate information.
        </p>
      </div>

      {error && (
        <div className="p-3 bg-glass-warning border border-trust-flagged text-text-primary text-xs font-semibold rounded-lg">
          {error}
        </div>
      )}

      {accountType === 'individual' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-text-muted uppercase tracking-wider">
              Full Name
            </label>
            <input
              {...register('full_name')}
              className="bg-background-app border border-border-subtle rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:ring-1 focus:ring-accent-primary focus:border-accent-primary focus:outline-none transition-all"
              placeholder="Legal name"
            />
            {errors.full_name && (
              <span className="text-xs text-trust-flagged">{errors.full_name.message as string}</span>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-text-muted uppercase tracking-wider">
              Date of Birth
            </label>
            <input
              type="date"
              {...register('date_of_birth')}
              className="bg-background-app border border-border-subtle rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:ring-1 focus:ring-accent-primary focus:border-accent-primary focus:outline-none transition-all"
            />
            {errors.date_of_birth && (
              <span className="text-xs text-trust-flagged">{errors.date_of_birth.message as string}</span>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium uppercase tracking-wider text-text-muted">Country of Residence</label>
          <select 
            {...register('country')} 
            onChange={handleCountryChange}
            className="rounded-xl border border-border-subtle bg-background-app px-4 py-3 text-sm text-text-primary placeholder:text-text-muted transition-all focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
          >
            <option value="">Select a country...</option>
            {Object.keys(COUNTRY_CODES).map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
            <option value="Other">Other</option>
          </select>
          {errors.country && <p className="mt-1 text-xs text-trust-flagged">{errors.country?.message as string}</p>}
        </div>

        {accountType === 'individual' && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium uppercase tracking-wider text-text-muted">State</label>
            <input 
              {...register('state')} 
              placeholder="e.g. Lagos"
              className="rounded-xl border border-border-subtle bg-background-app px-4 py-3 text-sm text-text-primary placeholder:text-text-muted transition-all focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
            />
            {errors.state && <p className="mt-1 text-xs text-trust-flagged">{errors.state?.message as string}</p>}
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium uppercase tracking-wider text-text-muted">Address</label>
          <input 
            {...register('address')} 
            placeholder="Your full address"
            className="rounded-xl border border-border-subtle bg-background-app px-4 py-3 text-sm text-text-primary placeholder:text-text-muted transition-all focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
          />
          {errors.address && <p className="mt-1 text-xs text-trust-flagged">{errors.address?.message as string}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium uppercase tracking-wider text-text-muted">Phone Number</label>
          <input 
            {...register('phone_number')} 
            placeholder="+234..."
            className="rounded-xl border border-border-subtle bg-background-app px-4 py-3 text-sm text-text-primary placeholder:text-text-muted transition-all focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
          />
          <p className="text-xs leading-relaxed text-text-muted mt-1">Numbers only. E.g. +2348000000000</p>
          {errors.phone_number && <p className="mt-1 text-xs text-trust-flagged">{errors.phone_number?.message as string}</p>}
        </div>
      </div>

      <button 
        type="submit" 
        disabled={isSubmitting}
        className="mt-2 w-full rounded-xl bg-accent-primary px-4 py-3 text-center text-xs font-bold uppercase tracking-wide text-text-inverse shadow-lg transition-all hover:bg-accent-hover active:scale-95 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isSubmitting ? 'Saving...' : 'Complete Profile'}
      </button>
    </form>
  )
}
