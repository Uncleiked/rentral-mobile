import { AsyncLocalStorage } from 'node:async_hooks'
type QueryTiming = { model: string; operation: string; elapsedMs: number }
type Trace = { steps: QueryTiming[] }
const shared = globalThis as typeof globalThis & { rentralTransactionTrace?: AsyncLocalStorage<Trace> }
const storage = shared.rentralTransactionTrace ??= new AsyncLocalStorage<Trace>()
/** Record names/durations only. Query arguments, identifiers and results never enter this store. */
export async function traceDatabaseQuery<T>(model: string, operation: string, query: () => Promise<T>): Promise<T> {
 const trace = storage.getStore()
 if (!trace) return query()
 const start = Date.now()
 try { return await query() }
 finally {
  if (trace.steps.length < 80) trace.steps.push({ model: /^[A-Za-z][A-Za-z0-9_]{0,60}$/.test(model) ? model : 'unknown', operation: /^[A-Za-z][A-Za-z0-9_]{0,60}$/.test(operation) ? operation : 'unknown', elapsedMs: Math.max(0, Date.now() - start) })
 }
}
export function traceTransaction<T>(action: (snapshot: () => readonly QueryTiming[]) => Promise<T>): Promise<T> {
 const trace: Trace = { steps: [] }
 return storage.run(trace, () => action(() => [...trace.steps]))
}

