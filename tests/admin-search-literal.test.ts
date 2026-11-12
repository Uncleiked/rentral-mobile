import { expect, it } from 'vitest'
import { escapeAdminText } from '@/lib/admin/search'
it('treats Mongo regex metacharacters as ordinary admin search text', () => {
 const input='agent.*[1](home)+?^$|{2}'+String.fromCharCode(92)
 const escaped=escapeAdminText(input)
 const pattern=new RegExp(escaped,'i')
 expect(pattern.test(input.toUpperCase())).toBe(true)
 expect(pattern.test('agentZZ1home')).toBe(false)
 expect(escapeAdminText('host@example.com')).toBe('host@example'+String.fromCharCode(92)+'.com')
})
