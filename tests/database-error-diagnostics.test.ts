import { describe, expect, it } from 'vitest'
import { databaseErrorDiagnostic } from '@/lib/database/error-diagnostics'
describe('safe database diagnostics', () => {
 it('records an expired transaction code without its sensitive message or metadata', () => {
  const error = Object.assign(new Error('Transaction expired for mongodb://private:password@host/account?authSource=admin'), { name: 'PrismaClientKnownRequestError', code: 'P2028', meta: { error: 'Transaction timeout, account private@example.invalid', query: { password: 'private-secret' } } })
  expect(databaseErrorDiagnostic(error)).toEqual({ name: 'PrismaClientKnownRequestError', code: 'P2028', cause: 'transaction_timeout' })
  expect(JSON.stringify(databaseErrorDiagnostic(error))).not.toMatch(/password|private|mongodb|account|query/)
 })
 it('identifies server validation without exposing rejected values', () => {
  const error = Object.assign(new Error('Command failed: Document failed validation: government-id'), { name: 'PrismaClientKnownRequestError', code: 'P2010', meta: { code: '121', message: 'private-document-data' } })
  expect(databaseErrorDiagnostic(error)).toEqual({ name: 'PrismaClientKnownRequestError', code: 'P2010', mongoCode: 121, cause: 'document_validation' })
 })
 it('rejects invented codes and names rather than logging attacker-controlled values', () => {
  const error = Object.assign(new Error('private'), { name: 'private-email@example.invalid', code: 'private-password', meta: { code: 'secret' } })
  expect(databaseErrorDiagnostic(error)).toEqual({ name: 'Error' })
 })
 it('does not replace the response when an error accessor throws', () => {
  const error = new Error('private'); Object.defineProperty(error, 'code', { get() { throw new Error('private') } })
  expect(databaseErrorDiagnostic(error)).toEqual({ name: 'Error' })
 })
 it('distinguishes conflict and connection failures without reading arbitrary payloads', () => {
  expect(databaseErrorDiagnostic(Object.assign(new Error('private'), { code: 'P2034' }))).toMatchObject({ code: 'P2034', cause: 'write_conflict' })
  expect(databaseErrorDiagnostic(Object.assign(new Error('private'), { code: 'P1001' }))).toMatchObject({ code: 'P1001', cause: 'database_connection' })
  expect(databaseErrorDiagnostic(null)).toEqual({ name: 'UnknownError' })
 })
})

