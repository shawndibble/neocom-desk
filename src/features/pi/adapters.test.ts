import { describe, it, expect } from 'vitest';
import { pinRole, extractorProgramsFromPins, hasUnverifiedExtractors } from './adapters';
import type { PlanetPin } from '@/esi/endpoints';

const extractorHeads = [{ head_id: 1, latitude: 0, longitude: 0 }];

describe('pinRole', () => {
  it('identifies an extractor pin', () => {
    const pin: PlanetPin = {
      pin_id: 1,
      type_id: 100,
      latitude: 0,
      longitude: 0,
      extractor_details: { heads: extractorHeads },
    };
    expect(pinRole(pin)).toBe('extractor');
  });

  it('identifies a factory pin', () => {
    const pin: PlanetPin = {
      pin_id: 2,
      type_id: 101,
      latitude: 0,
      longitude: 0,
      factory_details: { schematic_id: 5 },
    };
    expect(pinRole(pin)).toBe('factory');
  });

  it('falls back to other for storage/command-center pins', () => {
    const pin: PlanetPin = { pin_id: 3, type_id: 102, latitude: 0, longitude: 0 };
    expect(pinRole(pin)).toBe('other');
  });
});

describe('extractorProgramsFromPins', () => {
  it('converts an extractor pin with a valid expiry_time', () => {
    const pin: PlanetPin = {
      pin_id: 1,
      type_id: 100,
      latitude: 0,
      longitude: 0,
      expiry_time: '2026-09-05T00:00:00Z',
      extractor_details: { heads: extractorHeads },
    };
    expect(extractorProgramsFromPins([pin])).toEqual([
      { pinId: 1, expiryTimeMs: Date.parse('2026-09-05T00:00:00Z') },
    ]);
  });

  it('excludes a pin with no extractor_details (spec-legal: heads is the only required key elsewhere)', () => {
    const pin: PlanetPin = {
      pin_id: 1,
      type_id: 100,
      latitude: 0,
      longitude: 0,
      expiry_time: '2026-09-05T00:00:00Z',
    };
    expect(extractorProgramsFromPins([pin])).toEqual([]);
  });

  it('excludes an extractor pin missing expiry_time rather than substituting a default', () => {
    const pin: PlanetPin = {
      pin_id: 1,
      type_id: 100,
      latitude: 0,
      longitude: 0,
      extractor_details: { heads: extractorHeads },
    };
    expect(extractorProgramsFromPins([pin])).toEqual([]);
  });

  it('excludes a pin with an unparseable expiry_time rather than producing NaN', () => {
    const pin: PlanetPin = {
      pin_id: 1,
      type_id: 100,
      latitude: 0,
      longitude: 0,
      expiry_time: 'not-a-date',
      extractor_details: { heads: extractorHeads },
    };
    expect(extractorProgramsFromPins([pin])).toEqual([]);
  });
});

describe('hasUnverifiedExtractors', () => {
  it('is false when every extractor pin has a valid program', () => {
    const pin: PlanetPin = {
      pin_id: 1,
      type_id: 100,
      latitude: 0,
      longitude: 0,
      expiry_time: '2026-09-05T00:00:00Z',
      extractor_details: { heads: extractorHeads },
    };
    expect(hasUnverifiedExtractors([pin])).toBe(false);
  });

  it('is false for a colony with no extractor pins at all', () => {
    const pin: PlanetPin = {
      pin_id: 1,
      type_id: 100,
      latitude: 0,
      longitude: 0,
      factory_details: { schematic_id: 5 },
    };
    expect(hasUnverifiedExtractors([pin])).toBe(false);
  });

  it('is true when an extractor pin is missing expiry_time — a status computed from the rest would overclaim confidence', () => {
    const pin: PlanetPin = {
      pin_id: 1,
      type_id: 100,
      latitude: 0,
      longitude: 0,
      extractor_details: { heads: extractorHeads },
    };
    expect(hasUnverifiedExtractors([pin])).toBe(true);
  });
});
