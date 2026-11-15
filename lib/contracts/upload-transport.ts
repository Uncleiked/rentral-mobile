import { z } from 'zod'
// Twelve standard GridFS chunks keep each raw HTTP body well below 4.5 MB.
export const UPLOAD_PART_BYTES = 261120 * 12
export const uploadCapabilitiesSchema = z.object({ chunked: z.boolean(), partSize: z.literal(UPLOAD_PART_BYTES) }).strict()
export const uploadPartResultSchema = z.object({ path: z.string().min(1).max(500), complete: z.boolean(), nextPart: z.number().int().min(1).max(67) }).strict()
export type UploadPartResult = z.infer<typeof uploadPartResultSchema>
