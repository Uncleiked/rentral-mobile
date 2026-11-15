/** Allowlisted diagnostics only: never log a Prisma message/meta payload, query or URI. */
export function databaseErrorDiagnostic(error: unknown): { name: string; code?: string; mongoCode?: number; cause?: string } {
  const result: { name: string; code?: string; mongoCode?: number; cause?: string } = { name: 'UnknownError' }
  try {
    if (!(error instanceof Error)) return result
    result.name = ['PrismaClientKnownRequestError', 'PrismaClientUnknownRequestError', 'PrismaClientInitializationError', 'PrismaClientValidationError', 'MongoServerError', 'MongoNetworkError', 'MongoServerSelectionError', 'Error'].includes(error.name) ? error.name : 'Error'
    const code: unknown = Reflect.get(error, 'code')
    if (typeof code === 'string' && /^P[0-9]{4}$/.test(code)) result.code = code
    const meta: unknown = Reflect.get(error, 'meta')
    const rawMongo: unknown = meta && typeof meta === 'object' ? Reflect.get(meta, 'code') : typeof code === 'number' ? code : undefined
    if ((typeof rawMongo === 'number' || typeof rawMongo === 'string' && /^[0-9]{1,7}$/.test(rawMongo)) && Number.isSafeInteger(Number(rawMongo))) result.mongoCode = Number(rawMongo)
    const detail = [error.message, ...(meta && typeof meta === 'object' ? ['message', 'error'].map(key => Reflect.get(meta, key)).filter((value): value is string => typeof value === 'string') : [])].join(' ').slice(0, 12000)
    if (result.code === 'P2028' && /expired|timeout|timed out/i.test(detail)) result.cause = 'transaction_timeout'
    else if (result.code === 'P2034' || /write conflict|writeconflict/i.test(detail)) result.cause = 'write_conflict'
    else if (result.mongoCode === 121 || /document failed validation/i.test(detail)) result.cause = 'document_validation'
    else if (result.code && ['P1001', 'P1002', 'P1017'].includes(result.code)) result.cause = 'database_connection'
  } catch { /* Untrusted error accessors must not break the error response. */ }
  return result
}

