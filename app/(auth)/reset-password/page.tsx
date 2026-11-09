'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { HeroBackground } from '@/components/ui/HeroBackground'
import { updatePassword } from './actions'

export default function ResetPasswordPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const router = useRouter()

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
      const result = await updatePassword(formData)
      if (!result.success) {
        toast.error(result.error)
      } else {
        toast.success('Password updated successfully!')
        router.replace(result.redirectTo)
        router.refresh()
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
          <h1 className="text-2xl font-bold text-text-primary tracking-wide mb-2">Set New Password</h1>
          <p className="text-sm text-text-secondary">
            Enter your new password below to regain access to your account.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-text-muted uppercase tracking-wider" htmlFor="token">Reset code</label>
            <input className="w-full bg-background-app border border-border-subtle rounded-xl px-4 py-3 text-sm text-text-primary focus:ring-1 focus:ring-accent-primary focus:outline-none" id="token" name="token" autoComplete="off" required minLength={43} maxLength={43} disabled={isLoading} placeholder="Paste your complete reset code" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-text-muted uppercase tracking-wider" htmlFor="password">
              New Password
            </label>
            <div className="relative w-full">
              <input
                className="w-full bg-background-app border border-border-subtle rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:ring-1 focus:ring-accent-primary focus:border-accent-primary focus:outline-none transition-all pr-12"
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                required
                minLength={8}
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors cursor-pointer p-1"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-text-muted uppercase tracking-wider" htmlFor="confirmPassword">
              Confirm New Password
            </label>
            <div className="relative w-full">
              <input
                className="w-full bg-background-app border border-border-subtle rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:ring-1 focus:ring-accent-primary focus:border-accent-primary focus:outline-none transition-all pr-12"
                id="confirmPassword"
                name="confirmPassword"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                required
                minLength={8}
                disabled={isLoading}
              />
            </div>
          </div>

          <button
            type="submit"
            className="mt-4 bg-accent-primary text-text-inverse font-bold uppercase tracking-wide text-xs py-3 px-4 rounded-xl hover:bg-accent-hover active:scale-95 transition-all shadow-lg text-center disabled:opacity-70 disabled:cursor-not-allowed"
            disabled={isLoading}
          >
            {isLoading ? 'Saving...' : 'Update Password'}
          </button>
        </form>
        </div>
      </div>
    </HeroBackground>
  )
}
