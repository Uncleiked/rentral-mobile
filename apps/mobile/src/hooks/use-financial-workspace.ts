import { useCallback, useEffect, useRef, useState } from 'react'
import type { FinancialOverview } from '../../../../lib/contracts/financial'
import { useMemberResource } from './use-member-resource'
import { loadFinancialWorkspace, nativeFinancialOverviewSchema } from '../lib/financial-api'
import { errorMessage } from '../lib/api'

type Archive = { base: FinancialOverview; operations: FinancialOverview['operations']; payments: FinancialOverview['payments']; operationsCursor: string | null; paymentsCursor: string | null }
export function useFinancialWorkspace() {
  const first = useMemberResource('/financial', nativeFinancialOverviewSchema)
  const [archive, setArchive] = useState<Archive | null>(null)
  const [pending, setPending] = useState<'operations' | 'payments' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const activeBase = useRef(first.data)
  const controller = useRef<AbortController | null>(null)
  useEffect(() => { activeBase.current = first.data; return () => { controller.current?.abort(); controller.current = null } }, [first.data])
  const matching = archive?.base === first.data ? archive : null
  const operationsCursor = matching ? matching.operationsCursor : first.data?.operationsNextCursor
  const paymentsCursor = matching ? matching.paymentsCursor : first.data?.paymentsNextCursor
  const more = useCallback(async (kind: 'operations' | 'payments'): Promise<void> => {
    const cursor = kind === 'operations' ? operationsCursor : paymentsCursor
    const base = first.data
    if (!base || !cursor || controller.current) return
    const request = new AbortController()
    controller.current = request; setPending(kind); setError(null)
    try {
      const next = await loadFinancialWorkspace(`?${kind}Cursor=${encodeURIComponent(cursor)}`, request.signal, first.actorId)
      if (!request.signal.aborted && activeBase.current === base) setArchive(previous => {
        const current: Archive = previous?.base === base ? previous : { base, operations: [], payments: [], operationsCursor: base.operationsNextCursor, paymentsCursor: base.paymentsNextCursor }
        const existing = [...base[kind], ...current[kind]]
        const seen = new Set(existing.map(item => item.id))
        if (kind === 'operations') return { ...current, operations: [...current.operations, ...next.operations.filter(item => !seen.has(item.id))], operationsCursor: next.operationsNextCursor }
        return { ...current, payments: [...current.payments, ...next.payments.filter(item => !seen.has(item.id))], paymentsCursor: next.paymentsNextCursor }
      })
    } catch (reason) { if (!request.signal.aborted && activeBase.current === base) setError(errorMessage(reason)) }
    finally { if (controller.current === request) { controller.current = null; setPending(null) } }
  }, [first.actorId, first.data, operationsCursor, paymentsCursor])
  return { ...first, operations: [...(first.data?.operations ?? []), ...(matching?.operations ?? [])], payments: [...(first.data?.payments ?? []), ...(matching?.payments ?? [])],
    operationsCursor, paymentsCursor, more, loadingMore: pending, moreError: error }
}
