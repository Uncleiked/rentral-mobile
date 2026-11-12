import { describe, expect, it } from 'vitest'
import { nativeAdminOperationLabels, nativePublishingChoices } from '../apps/mobile/src/lib/admin-publishing-policy'
import { adminCommandSchema, adminUserSchema } from '../lib/contracts/admin'
import { permissionsForRole } from '../lib/auth/roles-policy'
const actor = '11111111-1111-4111-8111-111111111111', id = '22222222-2222-4222-8222-222222222222'
const user = adminUserSchema.parse({ id, revision: 2, email: 'fixture@example.invalid', username: 'host', role: 'member', suspended: false, closed: false, galleryAllowed: true, freePostingAllowed: false, directPublishAllowed: false, galleryPermissionRevision: 1, createdAt: '2026-11-12T00:00:00Z' })
describe('native independent publication controls', () => {
 it('retains independent saved values under current admin permissions', () => {
  const choices = nativePublishingChoices(user, actor, 'admin', permissionsForRole('admin'))
  expect(choices.map(item => [item.operation,item.current,item.ownerOverride])).toEqual([['set_gallery_permission',true,false],['set_free_posting_permission',false,false],['set_direct_publish_permission',false,false]])
 })
 it.each(['member','finance','moderator','analyst'])('does not create grant powers for %s', role => expect(nativePublishingChoices(user,actor,role,permissionsForRole(role))).toEqual([]))
 it('hides ordinary self changes and protected owner edits', () => {
  expect(nativePublishingChoices({...user,id:actor,role:'admin'},actor,'admin',permissionsForRole('admin'))).toEqual([])
  expect(nativePublishingChoices({...user,role:'owner'},actor,'admin',permissionsForRole('admin'))).toEqual([])
 })
 it('marks owner self decisions for the existing explicit override contract', () => {
  const choices = nativePublishingChoices({...user,id:actor,role:'owner'},actor,'owner',permissionsForRole('owner'))
  expect(choices).toHaveLength(3);expect(choices.every(item=>item.ownerOverride)).toBe(true)
  for(const choice of choices){ const command={operation:choice.operation,clientId:id,targetId:actor,expectedRevision:2,allowed:!choice.current,ownerOverride:true,reason:'Short valid reason.'};expect(adminCommandSchema.safeParse(command).success).toBe(false);expect(adminCommandSchema.safeParse({...command,reason:'Reviewed the evidence and acknowledged this explicit owner decision.'}).success).toBe(true);expect(nativeAdminOperationLabels[choice.operation]).toBeTruthy() }
 })
 it.each([{closed:true},{suspended:true}])('hides approval controls for an unavailable target %s', extra => expect(nativePublishingChoices({...user,...extra},actor,'admin',permissionsForRole('admin'))).toEqual([]))
})
