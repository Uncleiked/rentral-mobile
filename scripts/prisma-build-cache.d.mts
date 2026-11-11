export type BuildEnvironment = Record<string, string | undefined>
export type PrismaCacheInspection = {
  valid: boolean
  reason: string
  inputHash: string | null
}
export type PrismaCacheWrite = { written: boolean; reason: string }
export function currentInputHash(root: string, env?: BuildEnvironment): Promise<string>
export function inspectPrismaBuildCache(root: string, env?: BuildEnvironment): Promise<PrismaCacheInspection>
export function writePrismaBuildCache(root: string, expectedInputHash: string | null, env?: BuildEnvironment): Promise<PrismaCacheWrite>