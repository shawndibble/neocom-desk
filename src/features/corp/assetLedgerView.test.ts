import { describe, expect, it } from 'vitest';
import { buildLocationLedger, classifyCorpAssets } from '@/engine/corp/assetLedger';
import type { CorpAssetInput } from '@/engine/corp/assetDivisions';
import {
  buildLocationRows,
  makeLedgerLabels,
  officeUsage,
  placementLabel,
  placementLabels,
  placementTone,
} from './assetLedgerView';

const t = (key: string, opts?: Record<string, unknown>) =>
  opts ? `${key}:${JSON.stringify(opts)}` : key;

const labels = makeLedgerLabels({
  t,
  typeNames: new Map([[34, 'Tritanium']]),
  locationNames: new Map([[500, 'Efa - Hangar Keep']]),
  divisionNames: new Map([[1, 'Ships']]),
});

function input(o: Partial<CorpAssetInput> & { itemId: number }): CorpAssetInput {
  return {
    typeId: 34,
    quantity: 1,
    locationId: 500,
    locationType: 'other',
    locationFlag: 'CorpSAG1',
    ...o,
  };
}

describe('placementLabel', () => {
  it('names the office by its first segment and the division by the corp’s name', () => {
    expect(placementLabel({ state: 'offices', locationId: 500, division: 1 }, labels)).toBe(
      'Efa · Ships'
    );
    expect(placementLabel({ state: 'offices', locationId: 500, division: 2 }, labels)).toContain(
      'Efa · corp.vitals.division'
    );
  });

  it('prints only the state when the place is unresolved', () => {
    expect(placementLabel({ state: 'impounded', locationId: 9, division: null }, labels)).toBe(
      'corp.assets.state.impounded'
    );
  });

  it('tints deliveries amber and recoverable states red', () => {
    expect(placementTone('deliveries')).toBe('warning');
    expect(placementTone('impounded')).toBe('danger');
    expect(placementTone('assetSafety')).toBe('danger');
    expect(placementTone('offices')).toBe('neutral');
  });
});

describe('Upwell structure names', () => {
  const STRUCTURE = 1_040_000_000_001;
  const withStructure = makeLedgerLabels({
    t,
    typeNames: new Map(),
    locationNames: new Map([[STRUCTURE, 'Jita - Test Corp Home Fortizar']]),
    divisionNames: new Map([[1, 'Ships']]),
  });

  it('prints the whole structure name in a chip, not just the system', () => {
    expect(
      placementLabel({ state: 'offices', locationId: STRUCTURE, division: 1 }, withStructure)
    ).toBe('Jita - Test Corp Home Fortizar · Ships');
  });

  it('prefixes a Fuel bay or In space group header with the structure', () => {
    const ledger = buildLocationLedger(
      classifyCorpAssets([
        input({
          itemId: 1,
          locationId: STRUCTURE,
          locationType: 'other',
          locationFlag: 'StructureFuel',
        }),
      ]),
      { prices: new Map() }
    );
    const rows = buildLocationRows(ledger, {
      tab: 'all',
      locationId: null,
      division: null,
      labels: withStructure,
      usage: officeUsage(ledger),
    });
    expect(rows[0]?.groupLabel).toBe('Jita - Test Corp Home Fortizar · corp.assets.state.fuelBay');
  });
});

describe('placementLabels', () => {
  const two = makeLedgerLabels({
    t,
    typeNames: new Map(),
    locationNames: new Map([
      [1, 'Efa - Hangar Keep'],
      [2, 'Efa - Trade Hub'],
      [3, 'Jita IV - Moon 4'],
    ]),
    divisionNames: new Map(),
  });

  it('keeps the short name unless two places share it, then prints the fuller one', () => {
    const texts = placementLabels(
      [
        { state: 'offices', locationId: 1, division: 1 },
        { state: 'offices', locationId: 2, division: 1 },
        { state: 'offices', locationId: 3, division: 1 },
      ],
      two
    );
    expect(texts[0]).toContain('Efa - Hangar Keep');
    expect(texts[1]).toContain('Efa - Trade Hub');
    expect(texts[2]).toMatch(/^Jita IV · /);
  });
});

describe('buildLocationRows', () => {
  const classified = classifyCorpAssets([
    input({ itemId: 10, typeId: 27, locationFlag: 'OfficeFolder', locationId: 500 }),
    input({ itemId: 11, typeId: 27, locationFlag: 'OfficeFolder', locationId: 600 }),
    input({ itemId: 1, locationId: 10, locationFlag: 'CorpSAG1', quantity: 5 }),
    input({ itemId: 2, locationId: 500, locationFlag: 'Impounded' }),
  ]);
  const ledger = buildLocationLedger(classified, { prices: new Map([[34, 10]]) });

  const usage = officeUsage(ledger);
  const base = { locationId: null, division: null, labels, usage } as const;

  it('lists only the divisions in use, and one placeholder row for an empty office', () => {
    const rows = buildLocationRows(ledger, { ...base, tab: 'all' });
    const efa = rows.filter((r) => r.groupKey === 'office:500');
    expect(efa).toHaveLength(1);
    expect(efa[0]).toMatchObject({
      kind: 'division',
      groupItems: 1,
      groupValue: 50,
      groupEmpty: false,
      groupDivisionsInUse: 1,
    });
    const empty = rows.filter((r) => r.groupKey === 'office:600');
    expect(empty).toHaveLength(1);
    expect(empty[0]).toMatchObject({ kind: 'empty', groupEmpty: true, groupDivisionsInUse: 0 });
    expect(rows.some((r) => r.kind === 'place' && r.state === 'impounded')).toBe(true);
  });

  it('never calls an office empty because a filter hid its stacks', () => {
    const filtered = buildLocationLedger(
      { ...classified, items: classified.items.filter((i) => i.input.itemId !== 1) },
      { prices: new Map([[34, 10]]) }
    );
    const rows = buildLocationRows(filtered, { ...base, tab: 'all' });
    // The office has no matching stack, so it lists nothing; it is not flagged empty.
    expect(rows.some((r) => r.groupKey === 'office:500')).toBe(false);
    expect(rows.find((r) => r.groupKey === 'office:600')?.groupEmpty).toBe(true);
    expect(
      buildLocationRows(filtered, { ...base, tab: 'all', filtered: true }).map((r) => r.groupKey)
    ).toEqual(['place:impounded:500']);
    expect(usage.get(500)).toEqual({ isEmpty: false, divisionsInUse: 1 });
  });

  it('narrows to one division, and drops other places', () => {
    const rows = buildLocationRows(ledger, { ...base, tab: 'all', locationId: 500, division: 1 });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'division', division: 1 });
  });

  it('shows only the matching places on a state tab', () => {
    const rows = buildLocationRows(ledger, { ...base, tab: 'impounded' });
    expect(rows.map((r) => r.kind)).toEqual(['place']);
  });
});
