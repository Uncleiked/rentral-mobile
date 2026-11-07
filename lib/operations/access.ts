import { requireUserId } from '@/lib/action-helpers'

/** Only server configuration can assign staff privileges. No editable user metadata. */
export function isAdminId(id: string): boolean {
  return (process.env.RENTRAL_ADMIN_IDS ?? '').split(',').map(value => value.trim()).filter(Boolean).includes(id)
}

export async function requireAdminId(): Promise<string | null> {
  const id = await requireUserId()
  return id && isAdminId(id) ? id : null
}

export async function requireInsightsId(): Promise<string | null> {
  const id = await requireUserId()
  if (!id) return null
  const allowed = (process.env.RENTRAL_INSIGHTS_IDS ?? '').split(',').map(value => value.trim())
  return isAdminId(id) || allowed.includes(id) ? id : null
}
