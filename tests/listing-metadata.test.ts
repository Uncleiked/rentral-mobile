import { afterEach, describe, expect, it, vi } from 'vitest';
import { boatMetadataSchema, carMetadataSchema, houseMetadataSchema } from '@/lib/schemas';
import { optionalFeeLimitNgn, validOptionalListingFee } from '@/lib/listing-fees';
import { vaultNeighborhood, vaultSavedDate } from '@/lib/vault-policy';

afterEach(() => vi.unstubAllEnvs());

const legacyHouse = { bedrooms: '0', bathrooms: '1', sizeSqm: '35', amenities: '' };

describe('listing metadata compatibility and disclosure', () => {
  it('accepts existing metadata and zero-bedroom studios without new mandatory fields', () => {
    expect(houseMetadataSchema.safeParse(legacyHouse).success).toBe(true);
    expect(carMetadataSchema.safeParse({ transmission: 'automatic', mileageKm: '0', seats: '5', fuelType: 'Electric' }).success).toBe(true);
    expect(boatMetadataSchema.safeParse({ vesselType: 'Yacht', capacityPersons: '8', hasCaptain: true }).success).toBe(true);
  });
  it('retains listing purpose, per-listing capacity, property structure and itemized decimal fees', () => {
    const metadata = { ...legacyHouse, rentalIntent: 'squat', hostCapacity: 'tenant', pricePeriod: 'month', propertyType: 'studio', kitchens: '1', floors: '0', state: 'Lagos', agencyFee: '12.34', legalFee: '', cautionFee: '0', serviceCharge: '100.25', landlordPreferences: 'No smoking in shared rooms.' };
    expect(houseMetadataSchema.parse(metadata)).toEqual(metadata);
  });
  it('rejects negative counts, unknown capacities and unsupported purposes', () => {
    expect(houseMetadataSchema.safeParse({ ...legacyHouse, kitchens: '-1' }).success).toBe(false);
    expect(houseMetadataSchema.safeParse({ ...legacyHouse, rentalIntent: 'invest' }).success).toBe(false);
    expect(houseMetadataSchema.safeParse({ ...legacyHouse, hostCapacity: 'verified-agent' }).success).toBe(false);
  });
  it.each(['-1', '1.001', '1e3', 'NaN', '01', '10000000.01'])('rejects invalid or over-limit fee %s', (fee: string) => {
    expect(houseMetadataSchema.safeParse({ ...legacyHouse, agencyFee: fee }).success).toBe(false);
  });
  it('compares decimal fee limits exactly, without floating point rounding', () => {
    vi.stubEnv('NEXT_PUBLIC_MAX_OPTIONAL_LISTING_FEE_NGN', '10.25');
    expect(optionalFeeLimitNgn()).toBe('10.25');
    expect(validOptionalListingFee('10.25')).toBe(true);
    expect(validOptionalListingFee('10.26')).toBe(false);
    expect(validOptionalListingFee('')).toBe(true);
    expect(validOptionalListingFee('0')).toBe(true);
  });
  it('falls back to the documented product limit if configuration is invalid', () => {
    vi.stubEnv('NEXT_PUBLIC_MAX_OPTIONAL_LISTING_FEE_NGN', '-10');
    expect(optionalFeeLimitNgn()).toBe('10000000');
  });
  it('retains vehicle insurance and vessel safety declarations', () => {
    expect(carMetadataSchema.parse({ transmission: 'manual', mileageKm: '200', seats: '4', fuelType: 'Petrol', bodyType: 'SUV', engineType: '2.0L', insuranceStatus: 'insured', insuranceDetails: 'Driver must hold a valid licence.' }).insuranceStatus).toBe('insured');
    expect(boatMetadataSchema.parse({ vesselType: 'Speedboat', capacityPersons: '8', hasCaptain: true, lifeJackets: true, safetyEquipment: 'First aid kit' }).lifeJackets).toBe(true);
  });
});

describe('Media Vault grouping', () => {
  it('returns only known broad areas and never the exact address', () => {
    expect(vaultNeighborhood('22 Private Street, Victoria Island, Lagos', undefined)).toBe('Victoria Island');
    expect(vaultNeighborhood('22 Private Street', 'Ibeju-Lekki')).toBe('Ibeju-Lekki');
    expect(vaultNeighborhood('22 Private Street', '123 exact address')).toBe('Other area');
  });
  it('groups dates in Lagos time across the UTC day boundary', () => {
    expect(vaultSavedDate(new Date('2026-11-06T23:30:00Z'))).toBe('7 November 2026');
  });
});
