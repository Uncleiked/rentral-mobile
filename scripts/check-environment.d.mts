export function inspectEnvironment(backend: Record<string, string | undefined>, mobile: Record<string, string | undefined>): {
  ok: boolean; errors: { key: string; message: string }[]; notes: string[]; verification: string
}
