import { captureReadingSchema, type CaptureReading } from '../../../../lib/contracts/capture'

export function captureAddressKey(address: string): string { return address.trim().toLowerCase().replace(/\s+/g, ' ') }

export function nativeCaptureReading(location: { mocked?: boolean; timestamp: number; coords: { latitude: number; longitude: number; accuracy: number | null } }, now = Date.now()): CaptureReading {
  if (!Number.isFinite(location.timestamp) || now - location.timestamp > 15000 || location.timestamp - now > 5000 || location.mocked || location.coords.accuracy === null) throw new Error('A fresh, precise GPS fix is needed. Enable precise location and try outdoors.')
  const reading = captureReadingSchema.safeParse({ latitude: location.coords.latitude, longitude: location.coords.longitude, accuracy: location.coords.accuracy, capturedAt: new Date(location.timestamp).toISOString(), ...(location.mocked === undefined ? {} : { mocked: location.mocked }) })
  if (!reading.success) throw new Error('A fresh, precise GPS fix is needed. Enable precise location and try outdoors.')
  return reading.data
}
