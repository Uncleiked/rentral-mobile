import { z } from 'zod'
import type { pushCapabilitySchema } from '../../../../lib/push/policy'
export type PushCapability = z.infer<typeof pushCapabilitySchema>
export type PushBuild = { platform: string; expoGo: boolean; projectId: string | null }
export function pushGate(build: PushBuild, server: PushCapability | null): { allowed: boolean; reason: string } {
  if (!['android', 'ios'].includes(build.platform)) return { allowed: false, reason: 'Remote updates are available in the Android and iOS app. Your notification inbox is available here.' }
  if (build.expoGo) return { allowed: false, reason: 'Remote updates need a Rentral development or production build. Expo Go cannot register this device for remote updates.' }
  if (!server?.enabled) return { allowed: false, reason: 'Remote updates are currently unavailable on this server. Your notification inbox still works.' }
  if (!z.uuid().safeParse(build.projectId).success) return { allowed: false, reason: 'This app build needs its Expo project configured before remote updates can be enabled.' }
  if (build.projectId?.toLowerCase() !== server.projectId?.toLowerCase()) return { allowed: false, reason: 'This app build and server use different Expo projects. Remote registration is unavailable.' }
  return { allowed: true, reason: 'Enable remote updates only if you want this device to receive generic Rentral alerts. Open the signed-in inbox to read details.' }
}
