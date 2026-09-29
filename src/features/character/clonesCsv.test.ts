import { describe, it, expect } from 'vitest';
import { clonesCsvColumns } from './clonesCsv';
import type { JumpClone } from '@/esi/endpoints';

const t = (k: string, options?: Record<string, unknown>) =>
  options ? `${k}:${JSON.stringify(options)}` : k;

function clone(overrides: Partial<JumpClone> = {}): JumpClone {
  return {
    jump_clone_id: 1,
    location_id: 60003760,
    location_type: 'station',
    implants: [],
    ...overrides,
  };
}

function valuesOf(
  c: JumpClone,
  names: { locations?: Map<number, string>; implants?: Map<number, string> } = {}
) {
  const columns = clonesCsvColumns(t, {
    locationNames: names.locations ?? new Map(),
    implantNames: names.implants ?? new Map(),
  });
  return Object.fromEntries(columns.map((col) => [col.header, col.value(c)]));
}

describe('clonesCsvColumns', () => {
  it('orders columns name, location, implants', () => {
    const columns = clonesCsvColumns(t, { locationNames: new Map(), implantNames: new Map() });
    expect(columns.map((c) => c.header)).toEqual([
      'clones.csvName',
      'clones.location',
      'clones.implants',
    ]);
  });

  it('splits the clone name from its location, leaving an unnamed clone blank', () => {
    const jita = new Map([[60003760, 'Jita IV - Moon 4']]);
    expect(valuesOf(clone({ name: '  Pod A ' }), { locations: jita })).toMatchObject({
      'clones.csvName': 'Pod A',
      'clones.location': 'Jita IV - Moon 4',
    });
    expect(valuesOf(clone({ name: '' }), { locations: jita })['clones.csvName']).toBeUndefined();
  });

  it('labels an unresolved location by its type and id', () => {
    expect(valuesOf(clone())['clones.location']).toBe('clones.stationLabel:{"id":60003760}');
    expect(
      valuesOf(clone({ location_type: 'structure', location_id: 1_000_000_000_001 }))[
        'clones.location'
      ]
    ).toBe('clones.structureLabel:{"id":1000000000001}');
  });

  it('lists implants by name in one cell, falling back to the type id', () => {
    const implants = new Map([[9941, 'Memory Augmentation - Basic']]);
    expect(valuesOf(clone({ implants: [9941, 9942] }), { implants })['clones.implants']).toBe(
      'Memory Augmentation - Basic; Type #9942'
    );
    expect(valuesOf(clone())['clones.implants']).toBe('');
  });
});
