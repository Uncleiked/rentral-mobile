import { describe, expect, it, vi } from 'vitest'
import { uploadListingMedia } from '@/lib/listing-upload'
import { videoExtensionForMime } from '@/lib/storage'

describe('upload cleanup', () => {
  it('waits for every upload to settle before cleaning up a rejected batch', async () => {
    let completePoster!: (value: { error: null }) => void
    const poster = new Promise<{ error: null }>(resolve => { completePoster = resolve })
    const remove = vi.fn().mockResolvedValue({ error: null })
    const upload = vi.fn().mockRejectedValueOnce(new Error('offline')).mockReturnValueOnce(poster)
    const client = { storage: { from: () => ({ upload, remove }) } } as unknown as Parameters<typeof uploadListingMedia>[0]
    const work = uploadListingMedia(client, 'owner', 'folder', {
      videoBlob: new Blob(['video']), videoMimeType: 'video/webm', posterBlob: new Blob(['poster']),
      documentFile: null, remoteVideoPath: null, remotePosterPath: null, remoteDocumentPath: null,
    })
    const rejection = expect(work).rejects.toThrow('listing-media-upload-failed')
    await Promise.resolve()
    expect(remove).not.toHaveBeenCalled()
    completePoster({ error: null })
    await rejection
    expect(remove).toHaveBeenCalledTimes(2)
  })
  it('preserves uploaded draft paths and does not delete reused objects', async () => {
    const upload = vi.fn()
    const remove = vi.fn()
    const client = { storage: { from: () => ({ upload, remove }) } } as unknown as Parameters<typeof uploadListingMedia>[0]
    const result = await uploadListingMedia(client, 'owner', 'folder', {
      videoBlob: null, videoMimeType: null, posterBlob: null, documentFile: null,
      remoteVideoPath: 'owner/folder/video.mp4', remotePosterPath: null, remoteDocumentPath: null,
    })
    expect(result.videoPath).toBe('owner/folder/video.mp4')
    expect(result.newUploads).toEqual([])
    expect(upload).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
  })
  it('retains the correct extension for codec-qualified MP4', () => {
    expect(videoExtensionForMime('video/mp4;codecs=avc1')).toBe('mp4')
    expect(videoExtensionForMime('video/quicktime')).toBe('mov')
  })
  it('reuses an already uploaded current take after a declined save rather than invalidating its sealed video path', async () => {
    const upload = vi.fn()
    const client = { storage: { from: () => ({ upload }) } } as unknown as Parameters<typeof uploadListingMedia>[0]
    const result = await uploadListingMedia(client, 'owner', 'folder', {
      videoBlob: new Blob(['same take']), videoMimeType: 'video/mp4', posterBlob: null, documentFile: null,
      remoteVideoPath: 'owner/folder/sealed.mp4', remotePosterPath: null, remoteDocumentPath: null,
    })
    expect(result.videoPath).toBe('owner/folder/sealed.mp4'); expect(result.newUploads).toEqual([]); expect(upload).not.toHaveBeenCalled()
  })
})
