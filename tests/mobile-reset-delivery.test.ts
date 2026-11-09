import { expect,it } from 'vitest'
import { passwordResetNotice } from '../apps/mobile/src/lib/reset-delivery'
it('describes queued email delivery conditionally without asserting receipt or leaking account existence',()=>{
  const notice=passwordResetNotice({delivery:'email'})
  expect(notice).toContain('If this account exists')
  expect(notice).toContain('queued for email delivery')
  expect(notice).not.toMatch(/outbox|delivered successfully|email was sent/i)
})
it('describes private development delivery without advertising a publicly accessible file path',()=>{
  const notice=passwordResetNotice({delivery:'development-outbox'})
  expect(notice).toContain('backend operator')
  expect(notice).toContain('private development outbox')
  expect(notice).not.toMatch(/\/api\/|storage\/|file:\/\//)
})
it.each([{}, {delivery:'unavailable'},{delivery:'email',token:'never render a code'}])('does not invent a delivery mode from an invalid acknowledgment%j',value=>{
  expect(()=>passwordResetNotice(value)).toThrow('could not be confirmed')
})
