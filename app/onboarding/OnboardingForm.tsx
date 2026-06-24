'use client'

import { useState } from 'react'
import { getOnboardingState, initiateVerification, refreshStatus, saveUsername } from './actions'

type Role = 'individual' | 'organization'

export type OnboardingState = {
  accountType: Role | null
  verificationStatus: string
  kycVerified: boolean
  username: string | null
  diditSessionId: string | null
}

const roleOptions: Array<{
  value: Role
  label: string
  description: string
}> = [
  {
    value: 'individual',
    label: 'Individual',
    description: 'KYC for renters, hosts, and private asset owners.',
  },
  {
    value: 'organization',
    label: 'Organization',
    description: 'KYB for registered agencies, fleets, and operators.',
  },
]

function statusLabel(status: string): string {
  switch (status) {
    case 'pending_review':
      return 'Didit is reviewing your submission.'
    case 'declined':
      return 'Verification was declined. Restart with corrected details.'
    case 'expired':
      return 'Your verification session expired. Start a fresh check.'
    case 'in_progress':
      return 'Verification is in progress. Refresh after completing Didit.'
    case 'verified':
      return 'Verification approved. Choose your public username.'
    default:
      return 'Choose how you want to verify on Rentral.'
  }
}

type OnboardingFormProps = {
  initialState: OnboardingState | null
  initialError?: string
}

export default function OnboardingForm({ initialState, initialError }: OnboardingFormProps) {
  const [role, setRole] = useState<Role>(initialState?.accountType ?? 'individual')
  const [state, setState] = useState<OnboardingState | null>(initialState)
  const [isLoading, setIsLoading] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isSavingUsername, setIsSavingUsername] = useState(false)
  const [error, setError] = useState<string | null>(initialError ?? null)

  const loadState = async (): Promise<void> => {
    const current = await getOnboardingState()
    if ('error' in current) {
      setError(current.error)
      return
    }

    setState(current)
    if (current.accountType) {
      setRole(current.accountType)
    }
  }

  const handleStartVerification = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    setIsLoading(true)
    setError(null)

    const formData = new FormData()
    formData.append('role', role)

    const result = await initiateVerification(formData)

    if ('error' in result) {
      setError(result.error ?? null)
      setIsLoading(false)
      await loadState()
      return
    }

    window.location.href = result.url
  }

  const handleRefresh = async (): Promise<void> => {
    setIsRefreshing(true)
    setError(null)

    const result = await refreshStatus()
    if (result?.error) {
      setError(result.error)
    }

    await loadState()
    setIsRefreshing(false)
  }

  const handleSaveUsername = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    setIsSavingUsername(true)
    setError(null)

    const formData = new FormData(event.currentTarget)
    const result = await saveUsername(formData)

    if (result?.error) {
      setError(result.error)
      setIsSavingUsername(false)
    }
  }

  const verificationStatus = state?.verificationStatus ?? 'unverified'
  const isVerified = state?.kycVerified === true
  const needsUsername = isVerified && !state?.username
  const isPending =
    verificationStatus === 'in_progress' ||
    verificationStatus === 'pending_review' ||
    verificationStatus === 'declined' ||
    verificationStatus === 'expired'

  return (
    <div className="mx-auto w-full max-w-md rounded-2xl border border-border-subtle bg-surface-card p-6 shadow-2xl sm:p-8">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 inline-flex rounded-full border border-glass-border-success bg-accent-muted px-3 py-1 text-xs font-semibold uppercase tracking-wider text-accent-hover">
          {verificationStatus === 'verified' ? 'Verified' : 'Identity Gate'}
        </div>
        <h1 className="mb-2 text-2xl font-bold tracking-wide text-text-primary">
          {needsUsername ? 'Reserve Your Username' : 'Verify Your Identity'}
        </h1>
        <p className="text-sm leading-relaxed text-text-secondary">
          {needsUsername
            ? 'Choose the public handle people will see across Rentral.'
            : statusLabel(verificationStatus)}
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-trust-flagged bg-glass-warning px-4 py-3 text-xs font-semibold leading-relaxed text-text-primary backdrop-blur-md">
          {error}
        </div>
      )}

      {needsUsername ? (
        <form onSubmit={handleSaveUsername} className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium uppercase tracking-wider text-text-muted" htmlFor="username">
              Username
            </label>
            <input
              className="rounded-xl border border-border-subtle bg-background-app px-4 py-3 text-sm text-text-primary placeholder:text-text-muted transition-all focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
              id="username"
              name="username"
              type="text"
              minLength={3}
              maxLength={24}
              pattern="[a-z0-9_]{3,24}"
              placeholder="rentral_host"
              required
            />
            <p className="text-xs leading-relaxed text-text-muted">
              Use 3-24 lowercase letters, numbers, or underscores.
            </p>
          </div>

          <button
            type="submit"
            disabled={isSavingUsername}
            className="rounded-xl bg-accent-primary px-4 py-3 text-center text-xs font-bold uppercase tracking-wide text-text-inverse shadow-lg transition-all hover:bg-accent-hover active:scale-95 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSavingUsername ? 'Saving Username...' : 'Enter Marketplace'}
          </button>
        </form>
      ) : (
        <>
          <form onSubmit={handleStartVerification} className="flex flex-col gap-6">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium uppercase tracking-wider text-text-muted">
                Account Type
              </label>
              <div className="mt-1 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {roleOptions.map((option) => {
                  const isSelected = role === option.value
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setRole(option.value)}
                      className={`rounded-xl border px-4 py-3 text-left transition-all active:scale-95 ${
                        isSelected
                          ? 'border-accent-primary bg-accent-muted text-text-primary'
                          : 'border-border-subtle bg-background-app text-text-secondary hover:border-glass-border-medium'
                      }`}
                    >
                      <span className="block text-xs font-bold uppercase tracking-wide">
                        {option.label}
                      </span>
                      <span className="mt-2 block text-xs leading-relaxed text-text-muted">
                        {option.description}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || isRefreshing}
              className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-accent-primary px-4 py-3 text-xs font-bold uppercase tracking-wide text-text-inverse shadow-lg transition-all hover:bg-accent-hover active:scale-95 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isLoading
                ? 'Starting Verification...'
                : role === 'organization'
                  ? 'Verify Organization'
                  : 'Verify Individual'}
            </button>
          </form>

          {isPending && (
            <div className="mt-8 border-t border-border-subtle pt-6 text-center">
              <p className="mb-3 text-xs leading-relaxed text-text-muted">
                Already completed Didit? Refresh your status to continue.
              </p>
              <button
                onClick={handleRefresh}
                disabled={isRefreshing || isLoading}
                className="rounded-full border border-glass-border-medium bg-glass-light px-4 py-2 text-[10px] font-bold uppercase tracking-wide text-text-primary backdrop-blur-md transition-all hover:bg-glass-light-hover active:scale-95 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isRefreshing ? 'Refreshing...' : 'Refresh Status'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
