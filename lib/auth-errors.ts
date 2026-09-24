export function authErrorMessage(error: unknown): string {
  const details = error && typeof error === 'object' ? error : {}
  const code = 'code' in details ? details.code : undefined
  const status = 'status' in details ? details.status : undefined
  const name = 'name' in details ? details.name : undefined

  if (name === 'AuthRetryableFetchError' || status === 0 || (typeof status === 'number' && status >= 500)) {
    return 'Unable to reach the sign-in service. Please try again shortly.'
  }
  if (status === 429 || code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit') {
    return 'Too many attempts. Please wait a moment before trying again.'
  }
  if (code === 'email_not_confirmed') return 'Confirm your email address before signing in.'
  if (code === 'provider_disabled' || code === 'oauth_provider_not_supported') {
    return 'This sign-in provider is unavailable. Please use email and password.'
  }
  if (code === 'invalid_credentials') return 'Email or password is incorrect.'
  return 'Sign-in could not be completed. Please try again.'
}
