'use client'
import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { createCommercialRequest } from '@/lib/commerce/client'
import { createMatchingRequest } from '@/lib/matching/client'

const ApiActor = createContext<string | null | undefined>(undefined)
/** An SSR-captured restriction, never an authentication or staff capability. */
export function ApiActorScope({ actorId, children }: { actorId: string | null; children: ReactNode }) {
  return <ApiActor.Provider key={actorId ?? 'signed-out'} value={actorId}>{children}</ApiActor.Provider>
}
function useApiActor(): string | null {
  const actor = useContext(ApiActor)
  if (actor === undefined) throw new Error('Marketplace API requests require a captured account scope.')
  return actor
}
export function useCommercialRequest() {
  const actor = useApiActor()
  return useMemo(() => createCommercialRequest(actor), [actor])
}
export function useMatchingRequest() {
  const actor = useApiActor()
  return useMemo(() => createMatchingRequest(actor), [actor])
}
