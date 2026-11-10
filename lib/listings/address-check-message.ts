import type { CaptureAddressFailureReason } from '../contracts/capture'

/** Shared presentation copy contains no provider payload, coordinates or secrets. */
export function captureAddressMessage(status: 'matched' | 'mismatch' | 'unavailable', reason?: CaptureAddressFailureReason): string {
  if (status === 'matched') return 'Address matches the recording location. The backend checks this again when you submit.'
  if (status === 'mismatch') return 'This address does not match the recording location. Correct the address or record a new walkthrough at the actual asset. Submission is blocked.'
  switch (reason) {
    case 'no_result': return 'This address was not found. Add the building number, street, area, city and state in Nigeria, then check again. Your draft is kept.'
    case 'low_confidence': return 'The address lookup found only an uncertain match. Check the building number, street, area, city and state, then try again. Your draft is kept.'
    case 'imprecise': return 'A precise building in Nigeria could not be confirmed. Add the building number, street, area, city and state, then check again. Your draft is kept.'
    case 'provider_unavailable': return 'The address service is temporarily unavailable. Your draft is kept; try again later.'
    default: return 'The building address could not be verified precisely. Check the building number, street, area, city and state, then try again. Your draft is kept.'
  }
}
