import type { PushRuntime } from './push-runtime.types'
export const pushRuntime: PushRuntime = {
  build: { platform: 'web', expoGo: false, projectId: null },
  permission: async () => ({ granted: false, canAskAgain: false }),
  requestPermission: async () => false,
  token: async () => { throw new Error('Remote push registration is available only in a native Rentral build.') },
  responses: async () => () => undefined,
  changes: async () => () => undefined,
}
