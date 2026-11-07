import { describe, expect, it } from 'vitest'
import { decodeDiscoveryCursor, discoveryHasFilters, discoveryHref, discoveryLocation, encodeDiscoveryCursor, parseDiscoveryFilters } from '@/lib/discovery-policy'

describe('discovery filters', () => {
  it('bounds untrusted query strings and rejects unexpected repeated parameters', () => {
    const filters = parseDiscoveryFilters({ category: ['house', 'car'], q: `  Lekki\u0000${'x'.repeat(150)}  `, minPrice: '-1', maxPrice: '1e10', view: 'unsafe' })
    expect(filters.category).toBe('all')
    expect(filters.q).toHaveLength(100)
    expect(filters.q).not.toContain('\u0000')
    expect(filters.minPrice).toBe('')
    expect(filters.maxPrice).toBe('')
    expect(filters.view).toBe('grid')
  })

  it('keeps studio zero and validates category-specific filters', () => {
    const filters = parseDiscoveryFilters({ category: 'house', bedrooms: '0', bathrooms: '2', kitchens: '200', seats: '5', capacityPersons: '201', transmission: 'automatic', intent: 'squat' })
    expect(filters).toMatchObject({ category: 'house', bedrooms: '0', bathrooms: '2', kitchens: '', seats: '5', capacityPersons: '', transmission: 'automatic', intent: 'squat' })
    expect(discoveryHasFilters(filters)).toBe(true)
  })

  it('drops an inverted upper bound instead of returning an impossible budget', () => {
    expect(parseDiscoveryFilters({ minPrice: '100000', maxPrice: '2000' })).toMatchObject({ minPrice: '100000', maxPrice: '' })
  })

  it('uses an exact timestamp and identifier cursor and preserves filters through pagination', () => {
    const cursor = { id: '27d5a2ee-62c1-4c5d-93de-7a0ee6d5728d', createdAt: '2026-11-07T12:00:00.000Z' }
    expect(decodeDiscoveryCursor(encodeDiscoveryCursor(cursor))).toEqual(cursor)
    expect(decodeDiscoveryCursor(`not-a-date~${cursor.id}`)).toBeNull()
    expect(decodeDiscoveryCursor(`${cursor.createdAt}~../../private`)).toBeNull()
    expect(decodeDiscoveryCursor(`${encodeDiscoveryCursor(cursor)}~extra`)).toBeNull()
    const url = new URL(discoveryHref(parseDiscoveryFilters({ category: 'car', q: 'Victoria Island', seats: '5' }), { cursor }), 'https://example.test')
    expect(url.searchParams.get('q')).toBe('Victoria Island')
    expect(url.searchParams.get('category')).toBe('car')
    expect(url.searchParams.get('seats')).toBe('5')
    expect(url.searchParams.get('cursor')).toBe(encodeDiscoveryCursor(cursor))
  })

  it('reveals only known neighborhoods, never a raw street address', () => {
    expect(discoveryLocation('14 Confidential Street, Ikoyi, Lagos')).toBe('Ikoyi, Lagos')
    expect(discoveryLocation('14 Confidential Street, Unknown district')).toBe('Lagos, Nigeria')
    expect(discoveryLocation(null)).toBe('Lagos, Nigeria')
  })
})
