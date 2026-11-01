import { describe, expect, it } from 'vitest';
import { orgMatesOf } from './localThreatContext';
import type { PilotListRow } from './pilotListData';

const row = (id: number, corp: number | null, alliance: number | null): PilotListRow =>
  ({
    name: `p${id}`,
    characterId: id,
    notFound: false,
    corporationId: corp,
    allianceId: alliance,
  }) as PilotListRow;

describe('orgMatesOf', () => {
  it('counts the others of the same alliance, across its corporations', () => {
    const mates = orgMatesOf([row(1, 10, 99), row(2, 11, 99), row(3, 12, 99), row(4, 13, null)]);
    expect(mates.get(1)).toBe(2);
    expect(mates.get(4)).toBe(0);
  });

  it('falls back to the corporation for a pilot with no alliance', () => {
    const mates = orgMatesOf([row(1, 10, null), row(2, 10, null), row(3, 10, 99)]);
    expect(mates.get(1)).toBe(1);
    expect(mates.get(3)).toBe(0);
  });

  it('leaves out a pilot whose corporation is not known yet', () => {
    expect(orgMatesOf([row(1, null, null)]).has(1)).toBe(false);
  });
});
