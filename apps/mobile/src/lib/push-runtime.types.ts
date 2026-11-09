import type { PushBuild } from './push-capability'
export type PushRuntime = { build: PushBuild; permission: () => Promise<{ granted: boolean; canAskAgain: boolean }>; requestPermission: () => Promise<boolean>; token: (projectId: string) => Promise<string>; responses: (onResponse: () => void) => Promise<() => void>; changes: (onChange: () => void) => Promise<() => void> }
