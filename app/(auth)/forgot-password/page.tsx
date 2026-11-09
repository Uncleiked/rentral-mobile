'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import Link from 'next/link'
import { HeroBackground } from '@/components/ui/HeroBackground'
import { sendPasswordReset } from './actions'

export default function ForgotPasswordPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [delivery, setDelivery] = useState<'email' | 'development-outbox'>('email')

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    if (!form.checkValidity()) {
      form.reportValidity()
      return
    }

    setIsLoading(true)
    const formData = new FormData(form)

    try {
      const result = await sendPasswordReset(formData)
      if (!result.success) {
        toast.error(result.error)
      } else {
        setIsSuccess(true)
        setDelivery(result.delivery)
        toast.success(result.message)
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'An unexpected error occurred.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <HeroBackground className="min-h-screen">
      <div className="w-full min-h-screen max-w-md mx-auto p-4 sm:p-6 flex flex-col items-center justify-center">
        <div className="bg-surface-card border border-border-subtle rounded-2xl p-6 sm:p-8 shadow-2xl w-full relative z-10">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-text-primary tracking-wide mb-2">Reset Password</h1>
          <p className="text-sm text-text-secondary">
            Enter your email to request a password reset code.
          </p>
        </div>

        {isSuccess ? (
          <div className="flex flex-col gap-6 text-center">
            <div className="mx-auto rounded-full bg-glass-border-success p-3 text-accent-primary">
              <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-sm text-text-primary font-medium">{delivery === 'email' ? 'If your account exists, check your inbox for its recovery code.' : 'Ask your Rentral operator for your recovery code.'}</p>
            <Link href="/reset-password" className="text-sm font-medium text-accent-hover">Use reset code</Link>
            <Link 
              href="/sign-in" 
              className="bg-glass-light border border-glass-border-medium text-text-primary font-bold uppercase tracking-wide text-xs py-3 px-4 rounded-xl hover:bg-glass-light-hover active:scale-95 transition-all backdrop-blur-md"
            >
              Back to Sign In
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-text-muted uppercase tracking-wider" htmlFor="email">
                Email Address
              </label>
              <input
                className="bg-background-app border border-border-subtle rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:ring-1 focus:ring-accent-primary focus:border-accent-primary focus:outline-none transition-all"
                id="email"
                name="email"
                type="email"
                placeholder="you@example.com"
                required
                disabled={isLoading}
              />
            </div>

            <button
              type="submit"
              className="mt-2 bg-accent-primary text-text-inverse font-bold uppercase tracking-wide text-xs py-3 px-4 rounded-xl hover:bg-accent-hover active:scale-95 transition-all shadow-lg text-center disabled:opacity-70 disabled:cursor-not-allowed"
              disabled={isLoading}
            >
              {isLoading ? 'Requesting...' : 'Request reset code'}
            </button>
            
            <div className="mt-4 text-center">
              <Link href="/sign-in" className="text-xs font-medium text-text-muted hover:text-text-primary transition-colors tracking-wide">
                ← Back to Sign In
              </Link>
            </div>
          </form>
        )}
        </div>
      </div>
    </HeroBackground>
  )
}
