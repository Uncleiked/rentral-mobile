import { Directory, File, Paths } from 'expo-file-system'
import * as Crypto from 'expo-crypto'
import * as Sharing from 'expo-sharing'
import { z } from 'zod'
import type { AccountExportResource } from '../../../../lib/contracts/account-lifecycle'
import type { AccountExportFile } from './account-export-file.types'
import { getSession } from './auth'

export async function createAccountExportFile(actorId: string, resource: AccountExportResource): Promise<AccountExportFile> {
  const directory = new Directory(Paths.cache, 'rentral-account-exports', z.string().uuid().parse(actorId))
  directory.create({ intermediates: true, idempotent: true })
  const file = new File(directory, `${resource}-${Crypto.randomUUID()}.json`)
  file.create()
  return {
    append: text => file.write(text, { append: true }),
    async share() {
      if (!await Sharing.isAvailableAsync()) throw new Error('This device cannot open a share sheet. Try another device or download your records from Rentral on the web.')
      if ((await getSession())?.user.id !== actorId) throw new Error('Your signed-in account changed. Prepare an export for the current account before sharing.')
      await Sharing.shareAsync(file.uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: 'Save or share your Rentral account export' })
      // Another app can still be reading after handoff; keep the private cache until explicit removal.
    },
    async remove() { if (file.exists) file.delete() },
  }
}
