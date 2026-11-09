import 'react-native-url-polyfill/auto'
import Constants from 'expo-constants'
import { Platform } from 'react-native'
import { resolveApiConfiguration } from './api-config'

let hostUri: string | undefined
try { hostUri = Constants.expoConfig?.hostUri } catch { hostUri = undefined }
const resolved = resolveApiConfiguration({
  apiUrl: process.env.EXPO_PUBLIC_API_URL,
  development: __DEV__, platform: Platform.OS, hostUri,
  webHostname: typeof window === 'undefined' ? undefined : window.location.hostname,
})
export const config = { apiUrl: resolved.apiUrl }
export const configurationError = resolved.configurationError
