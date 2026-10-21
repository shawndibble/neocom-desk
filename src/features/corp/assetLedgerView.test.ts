import { describe, expect, it } from 'vitest';
import { buildLocationLedger, classifyCorpAssets } from '@/engine/corp/assetLedger';
import type { CorpAssetInput } from '@/engine/corp/assetDivisions';
import {
  buildLocationRows,
  makeLedgerLabels,
  placementLabel,
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

describe('buildLocationRows', () => {
  const classified = classifyCorpAssets([
    input({ itemId: 10, typeId: 27, locationFlag: 'OfficeFolder', locationId: 500 }),
    input({ itemId: 11, typeId: 27, locationFlag: 'OfficeFolder', locationId: 600 }),
    input({ itemId: 1, locationId: 10, locationFlag: 'CorpSAG1', quantity: 5 }),
    input({ itemId: 2, locationId: 500, locationFlag: 'Impounded' }),
  ]);
  const ledger = buildLocationLedger(classified, { prices: new Map([[34, 10]]) });

  it('gives each office a group of seven divisions plus deliveries on All, flagging the empty one', () => {
    const rows = buildLocationRows(ledger, {
      tab: 'all',
      locationId: null,
      division: null,
      labels,
    });
    const efa = rows.filter((r) => r.groupKey === 'office:500');
    expect(efa).toHaveLength(8);
    expect(efa[0]).toMatchObject({ groupItems: 1, groupValue: 50, groupEmpty: false });
    expect(rows.find((r) => r.groupKey === 'office:600')?.groupEmpty).toBe(true);
    expect(rows.some((r) => r.kind === 'place' && r.state === 'impounded')).toBe(true);
  });

  it('narrows to one division, and drops other places', () => {
    const rows = buildLocationRows(ledger, { tab: 'all', locationId: 500, division: 1, labels });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'division', division: 1 });
  });

  it('shows only the matching places on a state tab', () => {
    const rows = buildLocationRows(ledger, {
      tab: 'impounded',
      locationId: null,
      division: null,
      labels,
    });
    expect(rows.map((r) => r.kind)).toEqual(['place']);
  });
});
