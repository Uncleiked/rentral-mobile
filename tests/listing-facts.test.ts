import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ListingFacts } from '@/components/listing/ListingFacts'
import type { ListingCategory } from '@/lib/contracts/listings'
import type { ListingMetadataJson } from '@/lib/profile-data'
const render = (category: ListingCategory, metadata: ListingMetadataJson) => renderToStaticMarkup(createElement(ListingFacts, { category, metadata }))

describe('public material listing information', () => {
  it('shows the actual description, house rules and zero bedrooms with readable category labels', () => {
    const html = render('house', { description: 'Quiet studio near public transport.\nPower is shared.', bedrooms: '0', bathrooms: '1', rentalIntent: 'squat', hostCapacity: 'tenant', propertyType: 'studio', landlordPreferences: 'No smoking. Ask before bringing pets.', amenities: 'Parking, Water, Parking' })
    expect(html).toContain('Quiet studio near public transport.\nPower is shared.')
    expect(html).toContain('No smoking. Ask before bringing pets.')
    expect(html).toContain('Shared living'); expect(html).toContain('Current tenant')
    expect(html).toMatch(/Bedrooms<\/dt><dd[^>]*>0<\/dd>/)
    expect(html.match(/>Parking</g)).toHaveLength(1)
  })
  it('renders owner prose as text and never exposes unknown private metadata', () => {
    const html = render('house', { description: '<script>alert(1)</script>', landlordPreferences: '<a href="javascript:alert(1)">Ask</a>', document_path: 'private-title.pdf', latitude: 6.5, hardware_coordinates: 'private GPS', private_reason: 'Confidential review evidence' })
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).not.toMatch(/<script|href="javascript:|private-title|private GPS|Confidential|latitude/)
  })
  it('shows vehicle condition terms without implying insurance was independently verified', () => {
    const html = render('car', { bodyType: 'SUV', engineType: 'V6 hybrid', transmission: 'automatic', insuranceStatus: 'not-insured', insuranceDetails: 'Driver must be over 25. Confirm excess before hire.', landlordPreferences: 'Do not render house-only rules' })
    expect(html).toContain('SUV'); expect(html).toContain('V6 hybrid'); expect(html).toContain('Automatic')
    expect(html).toContain('Host states not insured'); expect(html).toContain('Driver must be over 25.')
    expect(html).toContain('not an insurance verification'); expect(html).not.toContain('Do not render house-only rules')
  })
  it('keeps false boat safety declarations visible and distinct from missing data', () => {
    const html = render('boat', { vesselType: 'Speedboat', capacityPersons: '6', hasCaptain: false, lifeJackets: false, safetyEquipment: 'Confirm boarding conditions with operator.' })
    expect(html).toContain('Not included'); expect(html).toContain('Not available')
    expect(html).toContain('Confirm boarding conditions with operator.')
    const missing = render('boat', { vesselType: 'Yacht' })
    expect(missing.match(/>Not provided</g)).toHaveLength(2)
    expect(missing).not.toContain('>Not available<')
  })
  it('states when important optional material has not been provided', () => {
    const home = render('house', {})
    expect(home).toContain('The host has not added a description.')
    expect(home).toContain('House rules and occupancy requirements have not been provided.')
    expect(render('car', { insuranceStatus: 'not-provided' })).toContain('Cover, exclusions and driver requirements have not been provided.')
  })
})
