import { expect, it } from 'vitest'
import { assertAppendOnlyOperation } from '@/lib/database/append-only'

it('only permits a compare-and-swap Google credential fingerprint refresh; bindings stay immutable', () => {
  const where = { id: 'google-subject', user_id: 'user', credential_fingerprint: 'a'.repeat(64) }, data = { credential_fingerprint: 'b'.repeat(64) }
  expect(() => assertAppendOnlyOperation('GoogleIdentity', 'updateMany', { where, data })).not.toThrow()
  for (const args of [{ where: { id: 'google-subject' }, data }, { where, data: { user_id: 'someone-else' } }, { where, data: { ...data, user_id: 'someone-else' } }]) {
    expect(() => assertAppendOnlyOperation('GoogleIdentity', 'updateMany', args)).toThrow('APPEND_ONLY_RECORD')
  }
  for (const operation of ['update', 'delete', 'deleteMany', 'upsert']) expect(() => assertAppendOnlyOperation('GoogleIdentity', operation, {})).toThrow('APPEND_ONLY_RECORD')
})
