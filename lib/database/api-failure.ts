import { databaseErrorDiagnostic } from './error-diagnostics'
/** These failures are potentially transient. Do not claim whether a write committed. */
export function databaseApiFailure(error: unknown): { status: 503; code: string; message: string } | null {
 const diagnostic = databaseErrorDiagnostic(error)
 if (diagnostic.code === 'P2028' || diagnostic.code === 'P2034') return { status: 503, code: 'CHANGE_UNCONFIRMED', message: 'This change could not be confirmed. Check its current status before retrying.' }
 if (diagnostic.cause === 'database_connection') return { status: 503, code: 'DATABASE_UNAVAILABLE', message: 'The service is temporarily unavailable. Please try again shortly.' }
 return null
}

