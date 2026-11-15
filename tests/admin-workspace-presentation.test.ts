import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AdminRecordReview } from '../components/admin/AdminRecordReview'
import { AdminGlobalSearch } from '../components/admin/AdminGlobalSearch'
import { adminTabs, decisionsFor, type AdminSelection } from '../components/admin/admin-view'

const actorId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const memberId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const selection: AdminSelection = { kind: 'user', value: { id: memberId, revision: 0, email: 'synthetic@example.invalid', username: null, role: 'member', suspended: false, closed: false, galleryAllowed: false, freePostingAllowed: false, directPublishAllowed: false, galleryPermissionRevision: 0, createdAt: '2026-11-11T10:00:00Z' } }
const noop = () => undefined
const props = { selection, actorId, owner: true, permissions: ['gallery:manage'], blocked: false, busy: false, operation: 'set_gallery_permission', setOperation: noop, role: 'member', setRole: noop, reason: 'Reviewed the supplied account evidence for gallery listing permission.', setReason: noop, override: false, setOverride: noop, galleryAllowed: false, setGalleryAllowed: noop, freePostingAllowed: false, setFreePostingAllowed: noop, directPublishAllowed: false, setDirectPublishAllowed: noop, privateDocument: null, openedDocument: null, onPrepareDocument: noop, onOpenDocument: noop, onSubmit: noop, onClose: noop }
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
  it('keeps the free-posting switch and its save gate independent of gallery access', () => {
    const free = { ...props, operation: 'set_free_posting_permission', permissions: ['listing:waive'] }
    expect(saveDisabled(renderToStaticMarkup(createElement(AdminRecordReview, free)))).toBe(true)
    const html = renderToStaticMarkup(createElement(AdminRecordReview, { ...free, freePostingAllowed: true }))
    expect(saveDisabled(html)).toBe(false)
    expect(html).toContain('Allow free listing posts')
    expect(html).not.toContain('Allow gallery uploads')
    expect(decisionsFor(selection, ['listing:waive'], actorId, false).map(action => action.value)).toEqual(['set_free_posting_permission'])
  })
  it('requires an explicit owner override for their own direct publication permission', () => {
    const own: AdminSelection = { kind: 'user', value: { ...selection.value, id: actorId, role: 'owner' } }
    const direct = { ...props, selection: own, operation: 'set_direct_publish_permission', directPublishAllowed: true }
    expect(saveDisabled(renderToStaticMarkup(createElement(AdminRecordReview, direct)))).toBe(true)
    expect(saveDisabled(renderToStaticMarkup(createElement(AdminRecordReview, { ...direct, override: true })))).toBe(false)
    expect(decisionsFor(selection, ['gallery:manage'], actorId, false).map(action => action.value)).toEqual(['set_gallery_permission', 'set_direct_publish_permission'])
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
it('explains the short reason that keeps a gallery permission decision disabled', () => {
  const html = renderToStaticMarkup(createElement(AdminRecordReview, { ...props, galleryAllowed: true, reason: 'good person' }))
  expect(saveDisabled(html)).toBe(true)
  expect(html).toContain('Before you can record this decision')
  expect(html).toContain('Add 4 more characters to the reason (at least 15 total).')
  expect(html).toContain('aria-invalid="true"')
  expect(html).toContain('publication without manual review')
  const valid = renderToStaticMarkup(createElement(AdminRecordReview, { ...props, galleryAllowed: true, reason: 'Reviewed this account and approved gallery publication.' }))
  expect(saveDisabled(valid)).toBe(false)
})
it('explains the detailed owner reason and acknowledgement without weakening self-grant protection', () => {
  const own: AdminSelection = { kind: 'user', value: { ...selection.value, id: actorId, role: 'owner' } }
  const html = renderToStaticMarkup(createElement(AdminRecordReview, { ...props, selection: own, galleryAllowed: true, reason: 'good person' }))
  expect(saveDisabled(html)).toBe(true)
  expect(html).toContain('Add 19 more characters to the reason (at least 30 total).')
  expect(html).toContain('Tick the owner acknowledgement')
})

it('limits global search categories to current admin workspaces and hides an unavailable search', () => {
  const base = { actorId, disabled: false, onOpen: noop, onListing: noop, onMember: noop }
  const finance = renderToStaticMarkup(createElement(AdminGlobalSearch, { ...base, tabs: [{ id: 'tools' }] }))
  expect(finance).toBe('')
  const moderator = renderToStaticMarkup(createElement(AdminGlobalSearch, { ...base, tabs: [{ id: 'listings' }, { id: 'tools' }] }))
  expect(moderator).toContain('value="listings"')
  expect(moderator).not.toContain('value="members"')
  expect(moderator).not.toContain('value="organizations"')
  expect(moderator).not.toContain('value="audit"')
})
