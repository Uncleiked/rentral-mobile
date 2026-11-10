import { z } from 'zod'

export const galleryProofItemSchema = z.object({
  kind: z.enum(['image', 'video']), path: z.string().min(1).max(500), objectId: z.string().regex(/^[a-f0-9]{64}$/), digest: z.string().regex(/^[a-f0-9]{64}$/),
  sizeBytes: z.number().int().positive().max(200 * 1024 * 1024), contentType: z.enum(['image/jpeg', 'image/png', 'video/mp4', 'video/quicktime', 'video/webm']),
}).strict().refine(value => value.kind === 'image' ? value.contentType.startsWith('image/') && value.sizeBytes <= 10 * 1024 * 1024 : value.contentType.startsWith('video/'), 'The media type and gallery item must agree.')
export const galleryProofSchema = z.array(galleryProofItemSchema).max(11).refine(items => items.filter(item => item.kind === 'image').length <= 10 && items.filter(item => item.kind === 'video').length <= 1
  && new Set(items.map(item => item.path.toLowerCase())).size === items.length && new Set(items.map(item => item.objectId)).size === items.length, 'Gallery media must be unique and bounded.')
export type GalleryMediaProof = z.infer<typeof galleryProofItemSchema>
