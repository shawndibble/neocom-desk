import { describe, it, expect } from 'vitest';
import { lpOfferToSearchRow } from '@/engine/contracts/bpcSearch';
import type { NpcStationEntry } from '@/sde/marketTypes';
import { placeLpRows } from './lpStationRows';

const lp = (corporationId: number) =>
  lpOfferToSearchRow({
    corporationId,
    offerId: 1,
    corpName: 'Corp',
    typeId: 10,
    quantity: 1,
    price: 5,
    iskCost: 5,
    lpCost: 0,
    lpPriced: true,
  });

const stations = [
  { id: 1, name: 'Far IV', systemId: 100, ownerCorporationId: 7 },
  { id: 2, name: 'Near II', systemId: 200, ownerCorporationId: 7 },
] as NpcStationEntry[];
const jumps = new Map([
  [100, 9],
  [200, 3],
]);

describe('placeLpRows', () => {
  it('gives an LP row its corporation nearest station', () => {
    const [row] = placeLpRows([lp(7)], stations, jumps);
    expect(row).toMatchObject({ systemId: 200, stationName: 'Near II' });
  });

  it('leaves a corporation with no reachable station unplaced', () => {
    const [row] = placeLpRows([lp(8)], stations, jumps);
    expect(row).toMatchObject({ systemId: null, stationName: null });
  });

  it('returns rows unchanged while stations or distances are unknown', () => {
    const rows = [lp(7)];
    expect(placeLpRows(rows, null, jumps)).toBe(rows);
    expect(placeLpRows(rows, stations, null)).toBe(rows);
  });
});
