'use client'

import { useState } from 'react'
import { createClient } from '@/lib/client'
import { useRouter } from 'next/navigation'
import { login, signup } from './actions'
import { toast } from 'sonner'

export default function AuthForm() {
  const [isLoading, setIsLoading] = useState(false)
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
      if (result?.error) {
        toast.error(result.error)
      } else if (result?.success && result.redirectTo) {
        toast.success(action === 'login' ? 'Signed in successfully.' : 'Account created!')
        router.push(result.redirectTo)
        router.refresh()
      }
    } catch (err: unknown) {
      toast.error((err as Error).message || 'An unexpected error occurred.')
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
          <input
            className="bg-background-app border border-border-subtle rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:ring-1 focus:ring-accent-primary focus:border-accent-primary focus:outline-none transition-all"
            id="password"
            name="password"
            type="password"
            placeholder="••••••••"
            required
          />
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
          className="bg-white text-black font-bold uppercase tracking-wide text-xs py-3 px-4 rounded-xl hover:bg-gray-100 active:scale-95 transition-all shadow-md flex justify-center items-center gap-2"
          disabled={isLoading}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          Google
        </button>
        
        <button
          onClick={() => handleOAuth('apple')}
          type="button"
          className="bg-black border border-[#333] text-white font-bold uppercase tracking-wide text-xs py-3 px-4 rounded-xl hover:bg-neutral-900 active:scale-95 transition-all shadow-md flex justify-center items-center gap-2"
          disabled={isLoading}
        >
          <svg className="w-4 h-4 fill-current" viewBox="0 0 384 512">
            <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/>
          </svg>
          Apple
        </button>
      </div>
    </div>
  )
}
