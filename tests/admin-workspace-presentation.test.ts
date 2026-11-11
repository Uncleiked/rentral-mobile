import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AdminRecordReview } from '../components/admin/AdminRecordReview'
import { adminTabs, decisionsFor, type AdminSelection } from '../components/admin/admin-view'

const actorId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const memberId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const selection: AdminSelection = { kind: 'user', value: { id: memberId, revision: 0, email: 'synthetic@example.invalid', username: null, role: 'member', suspended: false, closed: false, galleryAllowed: false, galleryPermissionRevision: 0, createdAt: '2026-11-11T10:00:00Z' } }
const noop = () => undefined
const props = { selection, actorId, owner: true, permissions: ['gallery:manage'], blocked: false, busy: false, operation: 'set_gallery_permission', setOperation: noop, role: 'member', setRole: noop, reason: 'Reviewed the supplied account evidence for gallery listing permission.', setReason: noop, override: false, setOverride: noop, galleryAllowed: false, setGalleryAllowed: noop, privateDocument: null, openedDocument: null, onPrepareDocument: noop, onOpenDocument: noop, onSubmit: noop, onClose: noop }
function saveDisabled(html: string): boolean { return /<button[^>]*disabled=""[^>]*>Record decision<\/button>/.test(html) }

describe('admin review presentation safeguards', () => {
  it('does not submit a gallery decision until its desired state changes', () => {
    expect(saveDisabled(renderToStaticMarkup(createElement(AdminRecordReview, props)))).toBe(true)
    expect(saveDisabled(renderToStaticMarkup(createElement(AdminRecordReview, { ...props, galleryAllowed: true })))).toBe(false)
  })
  it('requires a detailed reason and explicit acknowledgement for owner self-gallery access', () => {
    const own: AdminSelection = { kind: 'user', value: { ...selection.value, id: actorId, role: 'owner' } }
    const self = { ...props, selection: own, galleryAllowed: true }
    expect(saveDisabled(renderToStaticMarkup(createElement(AdminRecordReview, self)))).toBe(true)
    const short = renderToStaticMarkup(createElement(AdminRecordReview, { ...self, override: true, reason: 'Short reason text.' }))
    expect(short).toContain('At least 30 characters.')
    expect(saveDisabled(short)).toBe(true)
    expect(saveDisabled(renderToStaticMarkup(createElement(AdminRecordReview, { ...self, override: true })))).toBe(false)
  })
  it('offers no ordinary role or suspension decisions against the protected owner', () => {
    const own: AdminSelection = { kind: 'user', value: { ...selection.value, role: 'owner' } }
    expect(decisionsFor(own, ['staff:manage', 'user:manage', 'gallery:manage'], actorId, false)).toEqual([])
    const html = renderToStaticMarkup(createElement(AdminRecordReview, { ...props, selection: own, owner: false }))
    expect(html).toContain('The platform owner is protected')
    expect(html).not.toContain('Record decision</button>')
  })
  it('matches decisions and tabs to available permissions and active account state', () => {
    expect(decisionsFor(selection, ['staff:manage'], actorId, false).map(action => action.value)).toEqual(['change_role'])
    const suspended: AdminSelection = { kind: 'user', value: { ...selection.value, suspended: true } }
    expect(decisionsFor(suspended, ['gallery:manage', 'user:manage'], actorId, true).map(action => action.value)).toEqual(['restore_user'])
    expect(adminTabs(['staff:workspace', 'finance:review', 'operations:read']).map(tab => tab.id)).toEqual(['audit', 'tools'])
  })
})