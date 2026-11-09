import { accountSelect, type AccountRecord } from './bootstrap'
import { withTransaction } from '@/lib/database/transactions'
import { assertActiveAccounts } from './availability'
import { prepareAvatarStorage, claimStorageObjects } from '@/lib/storage-claims/service'

type ProfileEdit = { username?: string; bio?: string | null; avatarUrl?: string | null }

/** Verify bytes outside retries, then claim the object with its account reference. */
export async function updateAccountProfile(userId: string, input: ProfileEdit): Promise<AccountRecord> {
  const prepared = input.avatarUrl ? await prepareAvatarStorage(userId, input.avatarUrl) : null
  return withTransaction(async tx => {
    await assertActiveAccounts(tx, [userId])
    if (prepared) await claimStorageObjects(tx, userId, prepared.objects)
    return tx.user.update({ where: { id: userId }, data: {
      ...(input.username !== undefined ? { username: input.username } : {}),
      ...(input.bio !== undefined ? { bio: input.bio || null } : {}),
      ...(input.avatarUrl !== undefined ? { avatar_url: prepared?.reference ?? null } : {}),
    }, select: accountSelect })
  })
}
