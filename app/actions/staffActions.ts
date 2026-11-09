'use server'

import { revalidatePath } from 'next/cache'
import { requireStaffId } from '@/lib/operations/access'
import { changeStaffRole } from '@/lib/auth/staff-service'
import { platformEnabled, PLATFORM_UNAVAILABLE, type ActionResult } from '@/lib/platform'

export async function changeStaffRoleAction(input: unknown): Promise<ActionResult> {
  try {
    if (!platformEnabled()) return { success: false, error: PLATFORM_UNAVAILABLE }
    const actorId = await requireStaffId('staff:manage')
    if (!actorId) return { success: false, error: 'Administrator access required.' }
    await changeStaffRole(actorId, input)
    revalidatePath('/marketplace/admin')
    return { success: true, data: undefined }
  } catch { return { success: false, error: 'Role not changed. Check the member ID and reason. Another administrator must change your own role; refresh before retrying.' } }
}
