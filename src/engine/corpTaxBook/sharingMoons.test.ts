import { describe, expect, it } from 'vitest';
import { popSharingFrom } from '../../../functions/src/popSharing';
import { sharingMoons, unplacedRefineries } from './sharingMoons';

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

describe('unplacedRefineries', () => {
  const feeder = (corporationId: number, extra: Record<string, unknown> = {}) => ({
    corporationId,
    status: 'active' as const,
    ...extra,
  });

  it('lists a known refinery with no Extraction yet, own and moon owners alike', () => {
    const rows = unplacedRefineries(
      [pull(7, 1000, '2026-10-01T00:00:00Z'), pull(9, 2000, '2026-11-02T00:00:00Z', 555)],
      [
        feeder(555, {
          refineryLabels: { '2000': { label: 'A' }, '2001': { label: 'B' } },
          refinerySystems: { '2002': 30000142 },
          refineryStructures: { '2003': { checkedAt: 1 } },
        }),
      ],
      [1000, 1001]
    );
    expect(rows).toEqual([
      { structureId: 1001, ownerOptedOut: false },
      { structureId: 2001, ownerCorporationId: 555, ownerOptedOut: false },
      { structureId: 2002, ownerCorporationId: 555, ownerOptedOut: false },
      { structureId: 2003, ownerCorporationId: 555, ownerOptedOut: false },
    ]);
  });

  it('an idle refinery whose only Extraction is long past has a moon: it is not listed here', () => {
    expect(unplacedRefineries([pull(7, 1000, '2024-01-01T00:00:00Z')], [], [1000])).toEqual([]);
  });

  it('skips a moon owner the book no longer handles, and marks one that opted out', () => {
    const rows = unplacedRefineries(
      [],
      [
        feeder(555, { refinerySystems: { '2000': 1 }, popSharingOptOut: { by: 1, at: 2 } }),
        feeder(556, { status: 'removed', refinerySystems: { '3000': 1 } }),
      ],
      []
    );
    expect(rows).toEqual([{ structureId: 2000, ownerCorporationId: 555, ownerOptedOut: true }]);
  });
});
