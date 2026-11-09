import type { AccountExportResource } from '../../../../lib/contracts/account-lifecycle'
import type { AccountExportFile } from './account-export-file.types'
import { getSession } from './auth'

export async function createAccountExportFile(actorId: string, resource: AccountExportResource): Promise<AccountExportFile> {
  const chunks: string[] = []
  let bytes = 0
  return {
    async append(text) {
      bytes += new TextEncoder().encode(text).byteLength
      if (bytes > 25 * 1024 * 1024) throw new Error('This resource is too large to download in this browser. Export it using the Android or iOS app.')
      chunks.push(text)
    },
    async share() {
      if ((await getSession())?.user.id !== actorId) throw new Error('Your signed-in account changed. Prepare an export for the current account before sharing.')
      const url = URL.createObjectURL(new Blob(chunks, { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url; link.download = `rentral-${resource}-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(link); link.click(); link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    },
    async remove() { chunks.length = 0; bytes = 0 },
  }
}
