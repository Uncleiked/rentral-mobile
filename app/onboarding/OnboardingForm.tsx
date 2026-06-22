'use client'

import { useState } from 'react'
import { initiateVerification, refreshStatus } from './actions'

export default function OnboardingForm() {
  const [role, setRole] = useState<'individual' | 'organization'>('individual')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    const formData = new FormData()
    formData.append('role', role)

    const res = await initiateVerification(formData)

    if (res?.error) {
      setError(res.error)
      setIsLoading(false)
      return
    }

    // Redirect the user to the Didit hosted verification page
    if (res?.url) {
      window.location.href = res.url
      return
    }

    setError('Something went wrong. No verification URL returned.')
    setIsLoading(false)
  }

  const handleRefresh = async () => {
    setIsRefreshing(true)
    setError(null)
    const res = await refreshStatus()
    if (res?.error) {
      setError(res.error)
    }
    setIsRefreshing(false)
  }

  return (
    <div className="bg-surface-card border border-border-subtle rounded-2xl p-6 sm:p-8 shadow-2xl max-w-md w-full mx-auto">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-text-primary tracking-wide mb-2">Verify Your Identity</h1>
        <p className="text-sm text-text-secondary">Select your account type and complete KYC to start using Rentral.</p>
      </div>

      {error && (
        <div className="mb-6 bg-glass-warning backdrop-blur-md border border-trust-flagged rounded-lg px-4 py-3 text-xs font-semibold text-text-primary">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-text-muted uppercase tracking-wider">
            I am a(n)
          </label>
          <div className="grid grid-cols-2 gap-3 mt-1">
            <button
              type="button"
              onClick={() => setRole('individual')}
              className={`py-3 px-4 rounded-xl text-xs font-bold uppercase tracking-wide border transition-all ${
                role === 'individual'
                  ? 'bg-glass-light border-accent-primary text-text-primary shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                  : 'bg-background-app border-border-subtle text-text-muted hover:border-glass-border-medium'
              }`}
            >
              Individual
            </button>
            <button
              type="button"
              onClick={() => setRole('organization')}
              className={`py-3 px-4 rounded-xl text-xs font-bold uppercase tracking-wide border transition-all ${
                role === 'organization'
                  ? 'bg-glass-light border-accent-primary text-text-primary shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                  : 'bg-background-app border-border-subtle text-text-muted hover:border-glass-border-medium'
              }`}
            >
              Organization
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading || isRefreshing}
          className="mt-2 bg-accent-primary text-text-inverse font-bold uppercase tracking-wide text-xs py-3 px-4 rounded-xl hover:bg-accent-hover active:scale-95 transition-all shadow-lg flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Starting Verification…
            </>
          ) : (
            'Verify with Didit'
          )}
        </button>
      </form>

      <div className="mt-8 pt-6 border-t border-border-subtle text-center">
        <p className="text-xs text-text-muted mb-3">Already completed verification? Click below to refresh your status.</p>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing || isLoading}
          className="bg-glass-light border border-glass-border-medium text-text-primary font-bold uppercase tracking-wide text-[10px] py-2 px-4 rounded-full hover:bg-glass-light-hover active:scale-95 transition-all backdrop-blur-md"
        >
          {isRefreshing ? 'Refreshing…' : 'Refresh Status'}
        </button>
      </div>
    </div>
  )
}
