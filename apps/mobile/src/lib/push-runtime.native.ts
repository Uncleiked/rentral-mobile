import Constants from 'expo-constants'
import { isRunningInExpoGo } from 'expo'
import { Platform } from 'react-native'
import type { PushRuntime } from './push-runtime.types'
import { expoPushTokenSchema } from '../../../../lib/push/policy'

const expoGo = isRunningInExpoGo()
const configuredProject: unknown = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId
const projectId = typeof configuredProject === 'string' ? configuredProject : null
let sdk: Promise<typeof import('expo-notifications')> | null = null
async function notifications() {
  if (expoGo || (Platform.OS !== 'android' && Platform.OS !== 'ios')) throw new Error('Remote updates require a native Rentral development or production build.')
  if (!sdk) sdk = import('expo-notifications').then(async notificationsSdk => {
    await notificationsSdk.setAutoServerRegistrationEnabledAsync(false)
    notificationsSdk.setNotificationHandler({ handleNotification: async () => ({ shouldPlaySound: false, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }) })
    return notificationsSdk
  }).catch(() => { sdk = null; throw new Error('Notification support could not be initialized in this build.') })
  return sdk
}
async function permission() {
  const notificationsSdk = await notifications(), value = await notificationsSdk.getPermissionsAsync()
  return { granted: value.granted || value.ios?.status === notificationsSdk.IosAuthorizationStatus.PROVISIONAL, canAskAgain: value.canAskAgain }
}
export const pushRuntime: PushRuntime = {
  build: { platform: Platform.OS, expoGo, projectId },
  permission,
  async requestPermission() {
    const notificationsSdk = await notifications()
    if (Platform.OS === 'android') await notificationsSdk.setNotificationChannelAsync('rentral-updates', { name: 'Rentral updates', importance: notificationsSdk.AndroidImportance.DEFAULT })
    const existing = await permission()
    if (existing.granted) return true
    if (!existing.canAskAgain) return false
    const value = await notificationsSdk.requestPermissionsAsync()
    return value.granted || value.ios?.status === notificationsSdk.IosAuthorizationStatus.PROVISIONAL
  },
  async token(project) {
    try {
      const notificationsSdk = await notifications()
      // The documented override uses the same registration base as SDK58 and keeps
      // token rotation under Rentral's own opt-in instead of enabling SDK auto updates.
      const result = await notificationsSdk.getExpoPushTokenAsync({ projectId: project, baseUrl: 'https://exp.host/--/api/v2/' })
      return expoPushTokenSchema.parse(result.data)
    } catch { throw new Error('The device push token could not be prepared. Check your connection and this build’s APNs or FCM credentials, then try again.') }
  },
  async responses(onResponse) {
    const notificationsSdk = await notifications()
    const handle = () => { onResponse(); notificationsSdk.clearLastNotificationResponse() }
    if (notificationsSdk.getLastNotificationResponse()) handle()
    const listener = notificationsSdk.addNotificationResponseReceivedListener(handle)
    return () => listener.remove()
  },
  async changes(onChange) { const notificationsSdk = await notifications(); const listener = notificationsSdk.addPushTokenListener(() => onChange()); return () => listener.remove() },
}
