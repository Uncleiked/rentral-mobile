'use client'

import { useState } from 'react'
import { createClient } from '@/lib/client'
import { useRouter } from 'next/navigation'
import { login, signup } from './actions'
import { toast } from 'sonner'

export default function AuthForm() {
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const router = useRouter()

  const supabase = createClient()

  const handleOAuth = async (provider: 'google' | 'apple') => {
    setIsLoading(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    if (error) toast.error(error.message)
    setIsLoading(false)
  }

  const handleEmailAuth = async (e: React.MouseEvent<HTMLButtonElement>, action: 'login' | 'signup') => {
    e.preventDefault()
    const form = e.currentTarget.form
    if (!form || !form.checkValidity()) {
      form?.reportValidity()
      return
    }

    setIsLoading(true)
    const formData = new FormData(form)
    
    try {
      const result = action === 'login' ? await login(formData) : await signup(formData)
      if ('error' in result) {
        toast.error(result.error)
      } else if (result.success && result.redirectTo) {
        toast.success(result.message ?? (action === 'login' ? 'Signed in successfully.' : 'Account created!'))
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
    <div className="bg-surface-card border border-border-subtle rounded-2xl p-6 sm:p-8 shadow-2xl max-w-md w-full mx-auto">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-text-primary tracking-wide mb-2">Welcome to Rentral</h1>
        <p className="text-sm text-text-secondary">Sign in to access the ultimate trust marketplace.</p>
      </div>

      <form className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-text-muted uppercase tracking-wider" htmlFor="email">
            Email
          </label>
          <input
            className="bg-background-app border border-border-subtle rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:ring-1 focus:ring-accent-primary focus:border-accent-primary focus:outline-none transition-all"
            id="email"
            name="email"
            type="email"
            placeholder="you@example.com"
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-text-muted uppercase tracking-wider" htmlFor="password">
            Password
          </label>
          <div className="relative w-full">
            <input
              className="w-full bg-background-app border border-border-subtle rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:ring-1 focus:ring-accent-primary focus:border-accent-primary focus:outline-none transition-all pr-12"
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              required
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

        <div className="flex flex-col gap-3 mt-4">
          <button
            type="submit"
            onClick={(e) => handleEmailAuth(e, 'login')}
            className="bg-accent-primary text-text-inverse font-bold uppercase tracking-wide text-xs py-3 px-4 rounded-xl hover:bg-accent-hover active:scale-95 transition-all shadow-lg text-center"
            disabled={isLoading}
          >
            Sign In
          </button>
          
          <button
            type="button"
            onClick={(e) => handleEmailAuth(e, 'signup')}
            className="bg-glass-light border border-glass-border-medium text-text-primary font-bold uppercase tracking-wide text-xs py-3 px-4 rounded-xl hover:bg-glass-light-hover active:scale-95 transition-all backdrop-blur-md text-center"
            disabled={isLoading}
          >
            Create Account
          </button>
        </div>
      </form>

      <div className="my-6 flex items-center gap-3">
        <div className="h-[1px] flex-1 bg-border-subtle"></div>
        <span className="text-xs font-medium text-text-muted uppercase tracking-wider">Or continue with</span>
        <div className="h-[1px] flex-1 bg-border-subtle"></div>
      </div>

      <div className="flex flex-col gap-3">
        <button
          onClick={() => handleOAuth('google')}
          type="button"
          className="flex items-center justify-center gap-2 rounded-xl border border-glass-border-medium bg-glass-light px-4 py-3 text-xs font-bold uppercase tracking-wide text-text-primary shadow-md backdrop-blur-md transition-all hover:bg-glass-light-hover active:scale-95"
          disabled={isLoading}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M12 12h8" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
          </svg>
          Google
        </button>
        
        <button
          onClick={() => handleOAuth('apple')}
          type="button"
          className="flex items-center justify-center gap-2 rounded-xl border border-glass-border-medium bg-background-app px-4 py-3 text-xs font-bold uppercase tracking-wide text-text-primary shadow-md transition-all hover:bg-glass-light active:scale-95"
          disabled={isLoading}
        >
          <svg className="h-4 w-4 fill-current" viewBox="0 0 384 512" aria-hidden="true">
            <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/>
          </svg>
          Apple
        </button>
      </div>
    </div>
  )
}
