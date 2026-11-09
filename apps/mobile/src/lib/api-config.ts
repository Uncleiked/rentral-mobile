type ApiConfigurationInput = {
  apiUrl?: string
  development: boolean
  platform: string
  hostUri?: string
  webHostname?: string
}
type ApiConfiguration = { apiUrl: string; configurationError: string | null }

const SET_BACKEND = 'Set EXPO_PUBLIC_API_URL to a backend address your device can reach, then restart Expo.'

/** Return a clean origin only; credentials, paths and signed queries stay out. */
export function validatedApiOrigin(value: string, allowHttp: boolean): string | null {
  try {
    const url = new URL(value.trim())
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/') return null
    if (url.protocol !== 'https:' && !(allowHttp && url.protocol === 'http:')) return null
    return url.origin
  } catch { return null }
}

function loopbackHost(value: string): boolean {
  return value === 'localhost' || value.endsWith('.localhost') || /^127\./.test(value) || value === '[::1]'
}

function localHost(value: string): boolean {
  if (loopbackHost(value)) return true
  const ipv4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(value)
  if (ipv4) {
    const [first, second] = ipv4.slice(1).map(Number)
    return first === 10 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168) || (first === 169 && second === 254)
  }
  // Expo normally supplies a LAN IP. Local DNS/mDNS and private IPv6 also work;
  // an app tunnel/public hostname cannot imply a backend listening on port3000.
  return /^\[(?:f[cd][0-9a-f]{2}:|fe[89ab][0-9a-f]:)/i.test(value)
    || /^[a-z0-9][a-z0-9-]*(?:\.(?:local|lan))?$/i.test(value)
}

function metroHost(value: string | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value.includes('://') ? value : `http://${value}`)
    return ['http:', 'https:', 'exp:', 'exps:'].includes(url.protocol) && !url.username && !url.password ? url.hostname.toLowerCase() : null
  } catch { return null }
}

export function resolveApiConfiguration(input: ApiConfigurationInput): ApiConfiguration {
  if (input.apiUrl?.trim()) {
    const origin = validatedApiOrigin(input.apiUrl, input.development)
    return origin ? { apiUrl: origin, configurationError: null } : {
      apiUrl: '', configurationError: `Use a clean ${input.development ? 'HTTP or HTTPS' : 'HTTPS'} backend origin without credentials, a path, query or fragment. ${SET_BACKEND}`,
    }
  }
  if (!input.development) return { apiUrl: '', configurationError: SET_BACKEND }

  const host = input.platform === 'web' ? metroHost(input.webHostname) : metroHost(input.hostUri)
  if (!host) return { apiUrl: '', configurationError: `The backend address could not be detected. ${SET_BACKEND}` }
  if (!localHost(host)) return { apiUrl: '', configurationError: `This Expo host needs an explicit backend address. Expo tunnels only expose the app server. ${SET_BACKEND}` }
  if (input.platform !== 'web' && loopbackHost(host)) return {
    apiUrl: '', configurationError: `Expo is using a loopback address. Set EXPO_PUBLIC_API_URL explicitly: use the computer's LAN address on a phone, http://10.0.2.2:3000 on an Android emulator, or http://localhost:3000 on an iOS simulator. Restart Expo afterward.`,
  }
  return { apiUrl: `http://${host}:3000`, configurationError: null }
}
