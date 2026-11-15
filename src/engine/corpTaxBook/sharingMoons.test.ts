import { describe, expect, it } from 'vitest';
import { popSharingFrom } from '../../../functions/src/popSharing';
import { sharingMoons } from './sharingMoons';

const pull = (moonId: number, structureId: number, startedAt: string, owner?: number) => ({
  moonId,
  structureId,
  startedAt,
  ...(owner === undefined ? {} : { sourceCorporationId: owner }),
});

describe('sharingMoons', () => {
  it('lists each moon once, at its latest refinery, own moons and moon owners alike', () => {
    const rows = sharingMoons(
      [
        pull(7, 1000, '2026-10-01T00:00:00Z'),
        pull(7, 1001, '2026-11-01T00:00:00Z'),
        pull(9, 2000, '2026-11-02T00:00:00Z', 555),
      ],
      [],
      popSharingFrom({ enabled: true })
    );
    expect(rows.map((r) => [r.moonId, r.structureId, r.ownerCorporationId])).toEqual([
      [7, 1001, undefined],
      [9, 2000, 555],
    ]);
    expect(rows.every((r) => r.effective.shared)).toBe(true);
  });

  it('marks a moon owner that opted out, keeping its moon settings', () => {
    const rows = sharingMoons(
      [pull(9, 2000, '2026-11-02T00:00:00Z', 555)],
      [{ corporationId: 555, popSharingOptOut: { by: 1, at: 2 } }],
      popSharingFrom({ enabled: true, moons: { '9': { notes: 'kept' } } })
    );
    expect(rows[0]).toMatchObject({
      ownerOptedOut: true,
      effective: { shared: false, blockedBy: 'owner-opted-out', settings: { notes: 'kept' } },
    });
  });
});
