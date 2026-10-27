import { describe, it, expect } from 'vitest';
import { SPACE_KINDS } from '@/engine/space';
import { intersectSystemSets, passesOrderFilters, systemsInSpace } from './orderBookFilters';

const JITA = { id: 30000142, name: 'Jita', security: 0.9459 };
const TAMA = { id: 30002813, name: 'Tama', security: 0.3 };
const HED_GP = { id: 30001161, name: 'HED-GP', security: -0.4 };
const THERA_LIKE = { id: 31000005, name: 'J164710', security: -0.99 };
const SYSTEMS = [JITA, TAMA, HED_GP, THERA_LIKE];

describe('systemsInSpace', () => {
  it('is no restriction (null) when every kind is picked', () => {
    expect(systemsInSpace(SYSTEMS, new Set(SPACE_KINDS))).toBeNull();
  });

  it('keeps only systems of the picked kinds', () => {
    expect(systemsInSpace(SYSTEMS, new Set(['highsec', 'lowsec'] as const))).toEqual(
      new Set([JITA.id, TAMA.id])
    );
  });

  it('bands a J-name system as wormhole, not nullsec', () => {
    expect(systemsInSpace(SYSTEMS, new Set(['nullsec'] as const))).toEqual(new Set([HED_GP.id]));
    expect(systemsInSpace(SYSTEMS, new Set(['wormhole'] as const))).toEqual(
      new Set([THERA_LIKE.id])
    );
  });

  it('admits nothing when no kind is picked', () => {
    expect(systemsInSpace(SYSTEMS, new Set())).toEqual(new Set());
  });
});

describe('intersectSystemSets', () => {
  it('passes one side through when the other is unrestricted', () => {
    const a = new Set([1, 2]);
    expect(intersectSystemSets(a, null)).toBe(a);
    expect(intersectSystemSets(null, a)).toBe(a);
    expect(intersectSystemSets(null, null)).toBeNull();
  });

  it('keeps only systems both allow', () => {
    expect(intersectSystemSets(new Set([1, 2, 3]), new Set([2, 3, 4]))).toEqual(new Set([2, 3]));
  });
});

describe('passesOrderFilters', () => {
  const order = { system_id: JITA.id, location_id: 60003760, volume_remain: 5 };

  it('passes everything with no filter set', () => {
    expect(passesOrderFilters(order, {})).toBe(true);
  });

  it('drops an order outside the allowed systems', () => {
    expect(passesOrderFilters(order, { allowedSystems: new Set([TAMA.id]) })).toBe(false);
    expect(passesOrderFilters(order, { allowedSystems: new Set([JITA.id]) })).toBe(true);
  });

  it('drops an order with less remaining than the minimum quantity, keeping one exactly at it', () => {
    expect(passesOrderFilters(order, { minQuantity: 6 })).toBe(false);
    expect(passesOrderFilters(order, { minQuantity: 5 })).toBe(true);
  });

  it('drops an order at a player structure when NPC stations only is on', () => {
    const npcStationIds = new Set([60003760]);
    expect(passesOrderFilters(order, { npcStationIds })).toBe(true);
    expect(passesOrderFilters({ ...order, location_id: 1035466617946 }, { npcStationIds })).toBe(
      false
    );
  });
});
