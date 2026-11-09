import { beforeEach, expect, it, vi } from 'vitest'
const fixture = vi.hoisted(() => ({ go: false, platform: 'android', permission: vi.fn(), requestPermission: vi.fn(), channel: vi.fn(), token: vi.fn(), auto: vi.fn(), handler: vi.fn(), listener: vi.fn(), tokenListener: vi.fn(), initial: vi.fn(), clearInitial: vi.fn() }))
vi.mock('expo', () => ({ isRunningInExpoGo: () => fixture.go }))
vi.mock('react-native', () => ({ Platform: { get OS() { return fixture.platform } } }))
vi.mock('expo-constants', () => ({ default: { easConfig: { projectId: '11111111-1111-4111-8111-111111111111' }, expoConfig: null } }))
vi.mock('expo-notifications', () => ({ getPermissionsAsync: fixture.permission, requestPermissionsAsync: fixture.requestPermission, setNotificationChannelAsync: fixture.channel, getExpoPushTokenAsync: fixture.token,
  setAutoServerRegistrationEnabledAsync: fixture.auto, setNotificationHandler: fixture.handler, AndroidImportance: { DEFAULT: 3 }, IosAuthorizationStatus: { PROVISIONAL: 3 },
  addNotificationResponseReceivedListener: fixture.listener, addPushTokenListener: fixture.tokenListener, getLastNotificationResponse: fixture.initial, clearLastNotificationResponse: fixture.clearInitial }))
beforeEach(() => {
  vi.resetModules(); vi.resetAllMocks(); fixture.go = false; fixture.platform = 'android'
  fixture.permission.mockResolvedValue({ granted: false, canAskAgain: true }); fixture.requestPermission.mockResolvedValue({ granted: true, canAskAgain: true })
  fixture.token.mockResolvedValue({ type: 'expo', data: 'ExpoPushToken[fixture_token_only]' }); fixture.auto.mockResolvedValue(undefined)
  fixture.listener.mockReturnValue({ remove: vi.fn() }); fixture.tokenListener.mockReturnValue({ remove: vi.fn() }); fixture.initial.mockReturnValue(null)
})
it('does not import/request notification support, permission or tokens inside ExpoGo', async () => {
  fixture.go = true
  const { pushRuntime } = await import('../apps/mobile/src/lib/push-runtime.native')
  expect(pushRuntime.build.expoGo).toBe(true)
  await expect(pushRuntime.requestPermission()).rejects.toThrow('development or production build')
  expect(fixture.permission).not.toHaveBeenCalled(); expect(fixture.requestPermission).not.toHaveBeenCalled(); expect(fixture.token).not.toHaveBeenCalled(); expect(fixture.auto).not.toHaveBeenCalled()
})
it('requests Android permission only explicitly and creates the required channel first', async () => {
  const { pushRuntime } = await import('../apps/mobile/src/lib/push-runtime.native')
  expect(await pushRuntime.requestPermission()).toBe(true)
  expect(fixture.channel).toHaveBeenCalledWith('rentral-updates', { name: 'Rentral updates', importance: 3 }); expect(fixture.requestPermission).toHaveBeenCalledTimes(1)
  expect(fixture.token).not.toHaveBeenCalled(); expect(fixture.auto).toHaveBeenCalledExactlyOnceWith(false)
})
it('does not prompt again when permission is denied and the OS disallows another request', async () => {
  fixture.permission.mockResolvedValue({ granted: false, canAskAgain: false })
  const { pushRuntime } = await import('../apps/mobile/src/lib/push-runtime.native')
  expect(await pushRuntime.requestPermission()).toBe(false); expect(fixture.requestPermission).not.toHaveBeenCalled(); expect(fixture.token).not.toHaveBeenCalled()
})
it('recognizes provisional iOS permission without manufacturing an extra prompt', async () => {
  fixture.platform = 'ios'; fixture.permission.mockResolvedValue({ granted: false, canAskAgain: false, ios: { status: 3 } })
  const { pushRuntime } = await import('../apps/mobile/src/lib/push-runtime.native')
  expect((await pushRuntime.permission()).granted).toBe(true); expect(await pushRuntime.requestPermission()).toBe(true); expect(fixture.requestPermission).not.toHaveBeenCalled()
})
it('uses the configured Expo project and documented registration endpoint override to avoid SDK auto enrollment', async () => {
  const { pushRuntime } = await import('../apps/mobile/src/lib/push-runtime.native')
  expect(await pushRuntime.token('11111111-1111-4111-8111-111111111111')).toBe('ExpoPushToken[fixture_token_only]')
  expect(fixture.token).toHaveBeenCalledExactlyOnceWith({ projectId: '11111111-1111-4111-8111-111111111111', baseUrl: 'https://exp.host/--/api/v2/' })
  expect(fixture.auto).toHaveBeenCalledExactlyOnceWith(false)
})
it('sanitizes SDK failures so provider/device token details are never shown in an error', async () => {
  fixture.token.mockRejectedValue(new Error('private-token-detail-never-show'))
  const { pushRuntime } = await import('../apps/mobile/src/lib/push-runtime.native')
  await expect(pushRuntime.token('11111111-1111-4111-8111-111111111111')).rejects.toThrow('device push token could not be prepared')
})
it('ignores notification payload deep links and clears initial responses after a generic callback', async () => {
  fixture.initial.mockReturnValue({ notification: { request: { content: { data: { href: 'https://attacker.invalid/private' } } } } })
  const callback = vi.fn(), { pushRuntime } = await import('../apps/mobile/src/lib/push-runtime.native')
  const remove = await pushRuntime.responses(callback)
  expect(callback).toHaveBeenCalledExactlyOnceWith(); expect(fixture.clearInitial).toHaveBeenCalledTimes(1)
  fixture.listener.mock.calls[0][0]({ notification: { request: { content: { data: { bookingId: 'private-id' } } } } })
  expect(callback).toHaveBeenCalledTimes(2); remove()
})
