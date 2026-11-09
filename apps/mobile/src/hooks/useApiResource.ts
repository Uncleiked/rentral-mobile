import { useCallback, useEffect, useState } from 'react'
import { api, errorMessage } from '../lib/api'

type ResourceState<T> = { path: string; version: number; data: T | null; error: string | null }

export function useApiResource<T>(path: string): { data: T | null; loading: boolean; error: string | null; refresh: () => void } {
  const [result, setResult] = useState<ResourceState<T> | null>(null)
  const [version, setVersion] = useState(0)
  const refresh = useCallback((): void => setVersion(value => value + 1), [])
  useEffect(() => {
    const controller = new AbortController()
    void api<T>(path, { signal: controller.signal }).then(value => {
      if (!controller.signal.aborted) setResult({ path, version, data: value, error: null })
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) setResult({ path, version, data: null, error: errorMessage(reason) })
    })
    return () => controller.abort()
  }, [path, version])
  // A changed query/refresh has no result yet; old data never flashes under new filters.
  const current = result?.path === path && result.version === version ? result : null
  return { data: current?.data ?? null, loading: !current, error: current?.error ?? null, refresh }
}
