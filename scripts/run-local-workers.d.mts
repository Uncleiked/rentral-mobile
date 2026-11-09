export type WorkerJob = { name: string; path: string; secret: string }
export type WorkerResult = { job: string; status: 'ok' | 'partial' | 'failed'; counts?: Record<string, number>; failedJobs?: string[]; code?: string }
export function localWorkerOrigin(value?: string): string
export function workerOptions(args: string[]): { once: boolean; help: boolean; intervalMs: number; timeoutMs: number }
export function workerJobs(env: Record<string, string | undefined>): { jobs: WorkerJob[]; problems: { job: string; code: string }[] }
export function runWorkerTick(origin: string, jobs: readonly WorkerJob[], options: { timeoutMs: number; signal: AbortSignal }, request?: typeof fetch): Promise<WorkerResult[]>
