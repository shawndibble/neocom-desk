import { describe, expect, it } from 'vitest';
import { compareStationGroups, distinctLocationIds, stationGroupKey } from './stationGroups';

interface Fill {
  transaction_id: number;
  date: string;
  is_buy: boolean;
  quantity: number;
  unit_price: number;
  location_id: number;
}

let nextId = 1;
const fill = (location_id: number, is_buy: boolean, amount: number): Fill => ({
  transaction_id: nextId++,
  date: '2026-10-01T00:00:00Z',
  is_buy,
  quantity: 1,
  unit_price: amount,
  location_id,
});

const NAMES: Record<number, string> = { 1: 'Jita', 2: 'Amarr', 3: 'Dodixie' };
const nameOf = (id: number) => NAMES[id] ?? `Location #${id}`;

describe('stationGroupKey', () => {
  it('keys a fill by its location id', () => {
    expect(stationGroupKey(fill(60003760, false, 1))).toBe('60003760');
  });
});

describe('distinctLocationIds', () => {
  it('lists each location once, ascending', () => {
    expect(distinctLocationIds([fill(3, false, 1), fill(1, true, 1), fill(3, true, 1)])).toEqual([
      1, 3,
    ]);
  });
});

describe('compareStationGroups', () => {
  const jita = [fill(1, false, 100), fill(1, true, 40)]; // net +60, 2 trades
  const amarr = [fill(2, false, 500)]; // net +500, 1 trade
  const dodixie = [fill(3, true, 30), fill(3, true, 30), fill(3, true, 30)]; // net -90, 3 trades
  const order = (mode: 'net' | 'name' | 'trades') =>
    [jita, amarr, dodixie]
      .sort(compareStationGroups(mode, nameOf))
      .map((rows) => nameOf(rows[0]!.location_id));

  it('ranks by net, highest first', () => {
    expect(order('net')).toEqual(['Amarr', 'Jita', 'Dodixie']);
  });

  it('ranks by name A to Z', () => {
    expect(order('name')).toEqual(['Amarr', 'Dodixie', 'Jita']);
  });

  it('ranks by trade count, most first', () => {
    expect(order('trades')).toEqual(['Dodixie', 'Jita', 'Amarr']);
  });

  it('breaks a tie by name', () => {
    const a = [fill(2, false, 10)];
    const b = [fill(1, false, 10)];
    expect([a, b].sort(compareStationGroups('net', nameOf)).map((r) => r[0]!.location_id)).toEqual([
      2, 1,
    ]);
  });
});
