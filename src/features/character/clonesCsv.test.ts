import { describe, it, expect } from 'vitest';
import { cloneCsvRows, clonesCsvColumns, type CloneCsvRow } from './clonesCsv';
import type { JumpClone } from '@/esi/endpoints';
import type { CloneRow } from '@/engine/clone/cloneVerdict';
import type { JumpsAwayResult } from '@/engine/clone/jumpsAway';
import type { ImplantDetail } from './clones';
import { WORN_CLONE_ID } from './cloneTraining';

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

interface Options {
  locations?: Map<number, string>;
  implants?: Map<number, string>;
  details?: Map<number, ImplantDetail>;
  nicknames?: Record<number, string>;
  prices?: Map<number, number | null>;
  security?: number;
  jumps?: JumpsAwayResult;
  training?: CloneRow;
  best?: string | number | null;
}

function columnsFor(o: Options = {}) {
  return clonesCsvColumns(t, {
    locationNames: o.locations ?? new Map(),
    implantNames: o.implants ?? new Map(),
    implantDetails: o.details ?? new Map(),
    nicknames: o.nicknames ?? {},
    prices: o.prices,
    wornPlaceName: 'Jita',
    securityOf: () => o.security,
    jumpsOf: () => o.jumps,
    trainingOf: () => o.training,
    bestCloneId: o.best ?? null,
  });
}

function valuesOf(row: CloneCsvRow, o: Options = {}) {
  return Object.fromEntries(columnsFor(o).map((col) => [col.header, col.value(row)]));
}

const jumpRow = (c: JumpClone): CloneCsvRow => ({ clone: c, implants: c.implants });

describe('clonesCsvColumns', () => {
  it('orders the columns like the card reads', () => {
    expect(columnsFor().map((c) => c.header)).toEqual([
      'clones.csvName',
      'clones.csvWorn',
      'clones.location',
      'clones.csvSecurity',
      'clones.csvJumpsAway',
      'clones.csvJumpsNote',
      'clones.implants',
      'clones.csvImplantsBySlot',
      'clones.csvImplantDetails',
      'clones.csvImplantValue',
      'clones.csvImplantsUnpriced',
      'clones.csvQueueSeconds',
      'clones.csvQueueDeltaSeconds',
      'clones.csvBestForTraining',
    ]);
  });

  it('splits the clone name from its location, leaving an unnamed clone blank', () => {
    const locations = new Map([[60003760, 'Jita IV - Moon 4']]);
    expect(valuesOf(jumpRow(clone({ name: '  Pod A ' })), { locations })).toMatchObject({
      'clones.csvName': 'Pod A',
      'clones.location': 'Jita IV - Moon 4',
    });
    expect(valuesOf(jumpRow(clone({ name: '' })), { locations })['clones.csvName']).toBeUndefined();
  });

  it("exports the pilot's own name for a clone ahead of ESI's", () => {
    expect(
      valuesOf(jumpRow(clone({ name: 'Pod A' })), { nicknames: { 1: 'Learning' } })[
        'clones.csvName'
      ]
    ).toBe('Learning');
  });

  it('labels an unresolved location by its type and id', () => {
    expect(valuesOf(jumpRow(clone()))['clones.location']).toBe(
      'clones.stationLabel:{"id":60003760}'
    );
    expect(
      valuesOf(jumpRow(clone({ location_type: 'structure', location_id: 1_000_000_000_001 })))[
        'clones.location'
      ]
    ).toBe('clones.structureLabel:{"id":1000000000001}');
  });

  it('lists implants by name in one cell, falling back to the type id', () => {
    const implants = new Map([[9941, 'Memory Augmentation - Basic']]);
    expect(
      valuesOf(jumpRow(clone({ implants: [9941, 9942] })), { implants })['clones.implants']
    ).toBe('Memory Augmentation - Basic; common.unknownType:{"id":9942}');
    expect(valuesOf(jumpRow(clone()))['clones.implants']).toBe('');
  });

  it('lists implants by slot, slotless last, and sums their value with the unpriced count', () => {
    const implants = new Map([
      [1, 'Alpha'],
      [2, 'Beta'],
      [3, 'Gamma'],
    ]);
    const details = new Map<number, ImplantDetail>([
      [1, { slot: 2, bonuses: {} }],
      [2, { slot: 1, bonuses: {} }],
    ]);
    const row = jumpRow(clone({ implants: [1, 2, 3] }));
    const values = valuesOf(row, {
      implants,
      details,
      prices: new Map([
        [1, 100],
        [2, 50],
        [3, null],
      ]),
    });
    expect(values['clones.csvImplantsBySlot']).toBe('1: Beta; 2: Alpha; Gamma');
    expect(values['clones.csvImplantValue']).toBe(150);
    expect(values['clones.csvImplantsUnpriced']).toBe(1);
    expect(valuesOf(row)['clones.csvImplantValue']).toBeUndefined();
  });

  it('explains an unknown jump count, and lists each implant with its bonus and price', () => {
    expect(
      valuesOf(jumpRow(clone()), { jumps: { kind: 'unknown', reason: 'noRoute' } })
    ).toMatchObject({
      'clones.csvJumpsAway': undefined,
      'clones.csvJumpsNote': 'assets.jumpsAway.unknownReason.noRoute',
    });
    const values = valuesOf(jumpRow(clone({ implants: [1, 2] })), {
      implants: new Map([[1, 'Alpha']]),
      details: new Map([[1, { slot: 1, bonuses: { intelligence: 3 } }]]),
      prices: new Map([
        [1, 100],
        [2, null],
      ]),
    });
    expect(values['clones.csvImplantDetails']).toBe(
      'Alpha (clones.implantBonus:{"value":3,"attribute":"clones.verdict.attribute.intelligence"}; clones.csvImplantPrice:{"price":100}); common.unknownType:{"id":2}'
    );
  });

  it('carries security, jumps away, queue time, delta and the best flag', () => {
    const values = valuesOf(jumpRow(clone({ jump_clone_id: 7 })), {
      security: 0.9,
      jumps: { kind: 'known', jumps: 4 },
      training: { cloneId: 7, totalSeconds: 3600, deltaSeconds: -600 },
      best: 7,
    });
    expect(values).toMatchObject({
      'clones.csvSecurity': 0.9,
      'clones.csvJumpsAway': 4,
      'clones.csvQueueSeconds': 3600,
      'clones.csvQueueDeltaSeconds': -600,
      'clones.csvBestForTraining': 'clones.verdict.badge',
    });
    expect(
      valuesOf(jumpRow(clone({ jump_clone_id: 8 })), { best: 7 })['clones.csvBestForTraining']
    ).toBeUndefined();
  });

  it('exports the worn clone as a flagged row in the current system', () => {
    const rows = cloneCsvRows([9941], [clone()]);
    expect(rows.map((r) => r.clone?.jump_clone_id ?? null)).toEqual([null, 1]);
    const values = valuesOf(rows[0], { best: WORN_CLONE_ID });
    expect(values).toMatchObject({
      'clones.csvWorn': 'clones.wearingNow',
      'clones.location': 'Jita',
      'clones.csvBestForTraining': 'clones.verdict.badge',
    });
    expect(cloneCsvRows(null, [clone()])).toHaveLength(1);
  });
});
