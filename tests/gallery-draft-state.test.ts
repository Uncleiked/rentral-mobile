import { describe, expect, it } from 'vitest'
import { galleryDraftSnapshot } from '@/lib/listings/gallery-draft-state'

const saved = { category: 'house', form: { address: 'Yaba', bedrooms: '0', hasCaptain: false }, photos: [{ path: 'owner/folder/photo.jpg', name: 'Original camera name.jpg' }], videoPath: null, videoName: null, documentPath: null, documentName: null }
describe('gallery draft account save state', () => {
  it('does not mark saved media dirty after readback renames the display filename or reorders form fields', () => {
    expect(galleryDraftSnapshot({ ...saved, form: { hasCaptain: false, bedrooms: '0', address: 'Yaba', emptyField: '', absent: undefined }, photos: [{ ...saved.photos[0], name: 'photo.jpg' }] })).toBe(galleryDraftSnapshot(saved))
  })
  it('tracks incomplete fields and file additions/removals as unsaved changes', () => {
    expect(galleryDraftSnapshot({ ...saved, form: { ...saved.form, address: 'Ya' } })).not.toBe(galleryDraftSnapshot(saved))
    expect(galleryDraftSnapshot({ ...saved, photos: [] })).not.toBe(galleryDraftSnapshot(saved))
    expect(galleryDraftSnapshot({ ...saved, videoName: 'tour.mp4' })).not.toBe(galleryDraftSnapshot(saved))
    expect(galleryDraftSnapshot({ ...saved, documentPath: 'owner/folder/authority.pdf' })).not.toBe(galleryDraftSnapshot(saved))
  })
  it('retains a studio bedroom value and false checkbox value rather than treating them as absent', () => {
    expect(galleryDraftSnapshot(saved)).toContain('"bedrooms":"0"')
    expect(galleryDraftSnapshot(saved)).toContain('"hasCaptain":false')
  })
})
