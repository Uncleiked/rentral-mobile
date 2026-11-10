import { z } from 'zod'

export const CAPTURE_MAX_ACCURACY_METERS = 100
export const CAPTURE_ADDRESS_TOLERANCE_METERS = 100
export const CAPTURE_FINISH_WINDOW_MS = 180000
export const CAPTURE_SEAL_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
const timestamp = z.string().datetime({ offset: true })
export const captureReadingSchema = z.object({
  latitude: z.number().finite().min(-90).max(90), longitude: z.number().finite().min(-180).max(180),
  accuracy: z.number().finite().positive().max(CAPTURE_MAX_ACCURACY_METERS), capturedAt: timestamp,
  mocked: z.boolean().optional(),
}).strict()
export const beginCaptureInputSchema = z.object({ id: z.string().uuid(), reading: captureReadingSchema }).strict()
export const finishCaptureInputSchema = z.object({ reading: captureReadingSchema, durationSeconds: z.number().finite().positive().max(120) }).strict()
export const sealCaptureInputSchema = z.object({ videoPath: z.string().min(1).max(500) }).strict()
export const checkCaptureAddressInputSchema = z.object({ address: z.string().trim().min(5).max(300) }).strict()
export const captureStatusSchema = z.object({
  id: z.string().uuid(), status: z.enum(['recording', 'recorded', 'sealed', 'expired']),
  startedAt: timestamp, finishBy: timestamp, finishedAt: timestamp.nullable(), sealBy: timestamp.nullable(),
  videoPath: z.string().max(500).nullable(), listingId: z.string().uuid().nullable(),
}).strict()
export const captureAddressResultSchema = z.object({ captureId: z.string().uuid(), status: z.enum(['matched', 'mismatch', 'unavailable']),
  addressHash: z.string().regex(/^[a-f0-9]{64}$/), toleranceMeters: z.literal(CAPTURE_ADDRESS_TOLERANCE_METERS),
}).strict()
export type CaptureReading = z.infer<typeof captureReadingSchema>
export type CaptureStatus = z.infer<typeof captureStatusSchema>
