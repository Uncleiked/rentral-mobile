import 'react-native-url-polyfill/auto'
import Constants from 'expo-constants'
import { Platform } from 'react-native'

function localBackend(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') return `http://${window.location.hostname}:3000`
  let host: string | undefined
  try { const uri = Constants.expoConfig?.hostUri; if (uri) host = new URL(uri.includes('://') ? uri : `http://${uri}`).hostname } catch { host = undefined }
  if (Platform.OS === 'android' && (!host || host === 'localhost' || host === '127.0.0.1')) host = '10.0.2.2'
  return `http://${host || 'localhost'}:3000`
}
const apiUrl = (process.env.EXPO_PUBLIC_API_URL || (__DEV__ ? localBackend() : '')).replace(/\/+$/, '')
function validOrigin(value: string): boolean {
  try {
    const url = new URL(value)
    return !url.username && !url.password && !url.search && !url.hash && url.pathname === '/'
      && (url.protocol === 'https:' || (__DEV__ && url.protocol === 'http:'))
  } catch { return false }
}
export const config = { apiUrl }
export const configurationError = validOrigin(apiUrl) ? null : 'Add the Rentral backend address to EXPO_PUBLIC_API_URL, then restart Expo.'
