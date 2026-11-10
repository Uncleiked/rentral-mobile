import type { Prisma } from '@prisma/client'

export const activeAccountWhere = { AND: [{ OR: [{ closed_at: null }, { closed_at: { isSet: false } }] }, { OR: [{ suspended_at: null }, { suspended_at: { isSet: false } }] }] } satisfies Prisma.UserWhereInput
export const activeAccountSelect = { id: true, closed_at: true, suspended_at: true } satisfies Prisma.UserSelect

export function accountIsActive(account: { closed_at: Date | null; suspended_at?: Date | null } | null | undefined): boolean {
  return Boolean(account && account.closed_at == null && account.suspended_at == null)
}

export class AccountUnavailableError extends Error {
  readonly code = 'ACCOUNT_UNAVAILABLE'
  constructor() { super('This account is unavailable for new marketplace activity.'); this.name = 'AccountUnavailableError' }
}

/** A real write is the serialization boundary with account closure, across all processes. */
export async function assertActiveAccounts(tx: Prisma.TransactionClient, userIds: readonly string[]): Promise<void> {
  for (const id of [...new Set(userIds)].sort()) {
    const locked = await tx.user.updateMany({ where: { id, ...activeAccountWhere }, data: { revision: { increment: 1 } } })
    if (locked.count !== 1) throw new AccountUnavailableError()
  }
}
