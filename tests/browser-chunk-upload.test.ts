import { afterEach, expect, it, vi } from 'vitest'
import { sendBrowserStoredFile } from '@/lib/local-storage/upload-client'
import { UPLOAD_PART_BYTES } from '@/lib/contracts/upload-transport'
const path = 'owner/folder/video.mp4', url = '/api/v1/uploads/listings-media?mediaSource=approved_gallery&permissionRevision=2'
const headers = { 'X-Upload-Path': path, 'X-Rentral-Account': 'owner', 'Content-Type': 'video/mp4' }
const response = (data: unknown) => Response.json({ success: true, data })
afterEach(() => vi.unstubAllGlobals())
it('keeps small and local single-request uploads unchanged', async () => {
 const fetcher = vi.fn().mockResolvedValue(response({ path })); vi.stubGlobal('fetch', fetcher)
 await sendBrowserStoredFile(url, new Blob(['small']), { headers }); expect(fetcher).toHaveBeenCalledOnce()
 fetcher.mockClear(); fetcher.mockResolvedValueOnce(response({ chunked: false, partSize: UPLOAD_PART_BYTES })).mockResolvedValueOnce(response({ path }))
 const file = new Blob([new Uint8Array(UPLOAD_PART_BYTES + 1)]); await sendBrowserStoredFile(url, file, { headers })
 expect(fetcher).toHaveBeenCalledTimes(2); expect(fetcher.mock.calls[1][1].body).toBe(file)
})
it('sends bounded sequential slices and retains ownership, media source and original path headers', async () => {
 const fetcher = vi.fn().mockResolvedValueOnce(response({ chunked: true, partSize: UPLOAD_PART_BYTES })).mockResolvedValueOnce(response({ path, complete: false, nextPart: 1 })).mockResolvedValueOnce(response({ path, complete: true, nextPart: 2 })); vi.stubGlobal('fetch', fetcher)
 const file = new Blob([new Uint8Array(UPLOAD_PART_BYTES + 17)]), result = await sendBrowserStoredFile(url, file, { headers })
 expect(result.ok).toBe(true); expect(fetcher.mock.calls[1][0]).toBe(url)
 for (const [index, size] of [[1, UPLOAD_PART_BYTES], [2, 17]]) { const init = fetcher.mock.calls[index][1]; expect(init.body.size).toBe(size); expect(init.headers.get('x-upload-path')).toBe(path); expect(init.headers.get('x-rentral-account')).toBe('owner'); expect(init.headers.get('x-upload-total-size')).toBe(String(file.size)); expect(init.headers.get('x-upload-part')).toBe(String(index - 1)) }
})
it('skips only the prefix confirmed by the server after an explicit retry from part zero', async () => {
 const fetcher = vi.fn().mockResolvedValueOnce(response({ chunked: true, partSize: UPLOAD_PART_BYTES })).mockResolvedValueOnce(response({ path, complete: false, nextPart: 2 })).mockResolvedValueOnce(response({ path, complete: true, nextPart: 3 })); vi.stubGlobal('fetch', fetcher)
 await sendBrowserStoredFile(url, new Blob([new Uint8Array(UPLOAD_PART_BYTES * 2 + 4)]), { headers })
 expect(fetcher.mock.calls[2][1].headers.get('x-upload-part')).toBe('2')
})
it.each([{ path: 'different', complete: true, nextPart: 2 }, { path, complete: false, nextPart: 0 }, { path, complete: true, nextPart: 1 }, { path, complete: false, nextPart: 3 }])('stops on ambiguous or impossible acknowledgements without sending another part', async data => {
 const fetcher = vi.fn().mockResolvedValueOnce(response({ chunked: true, partSize: UPLOAD_PART_BYTES })).mockResolvedValueOnce(response(data)); vi.stubGlobal('fetch', fetcher)
 await expect(sendBrowserStoredFile(url, new Blob([new Uint8Array(UPLOAD_PART_BYTES + 4)]), { headers })).rejects.toThrow('could not be confirmed')
 expect(fetcher).toHaveBeenCalledTimes(2)
})
it('stops immediately on a lost response and never retries automatically', async () => {
 const fetcher = vi.fn().mockResolvedValueOnce(response({ chunked: true, partSize: UPLOAD_PART_BYTES })).mockRejectedValueOnce(new Error('lost response')); vi.stubGlobal('fetch', fetcher)
 await expect(sendBrowserStoredFile(url, new Blob([new Uint8Array(UPLOAD_PART_BYTES + 4)]), { headers })).rejects.toThrow('lost response'); expect(fetcher).toHaveBeenCalledTimes(2)
})
