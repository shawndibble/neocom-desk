import { describe, expect, it } from 'vitest';
import { popSharingFrom } from '../../../functions/src/popSharing';
import { popShareMarks } from './popShareMarks';

const pull = (moonId: number, structureId: number, owner?: number) => ({
  moonId,
  structureId,
  startedAt: '2026-11-01T00:00:00Z',
  ...(owner === undefined ? {} : { sourceCorporationId: owner }),
});

const OPTED_OUT = { by: 1, at: 2 };

describe('popShareMarks', () => {
  it('marks a shared moon with its effective audiences, by moon and by refinery', () => {
    const marks = popShareMarks(
      [pull(7, 1000), pull(8, 1001)],
      [],
      popSharingFrom({
        enabled: true,
        moons: { '8': { audiences: [{ kind: 'alliance' }] } },
      })
    );
    expect(marks.moons).toEqual({
      '7': { kind: 'shared', audiences: [{ kind: 'corp' }] },
      '8': { kind: 'shared', audiences: [{ kind: 'alliance' }] },
    });
    expect(marks.structures['1001']).toEqual(marks.moons['8']);
  });

  it('leaves the shared mark off when every moon is shared alike, keeping opt-outs', () => {
    const marks = popShareMarks(
      [pull(7, 1000), pull(8, 1001), pull(9, 2000, 55)],
      [{ corporationId: 55, popSharingOptOut: OPTED_OUT }],
      popSharingFrom({ enabled: true })
    );
    expect(marks.moons['7']).toBeUndefined();
    expect(marks.moons['8']).toBeUndefined();
    expect(marks.moons['9']).toEqual({ kind: 'opted-out' });
    const alike = popShareMarks(
      [pull(7, 1000), pull(8, 1001)],
      [],
      popSharingFrom({ enabled: true })
    );
    expect(alike).toEqual({ moons: {}, structures: {}, owners: {} });
  });

  it('marks nothing while sharing is off or a moon has no audience left', () => {
    expect(popShareMarks([pull(7, 1000)], [], popSharingFrom({ enabled: false })).moons).toEqual(
      {}
    );
    const noAudience = popSharingFrom({ enabled: true, moons: { '7': { audiences: [] } } });
    expect(popShareMarks([pull(7, 1000)], [], noAudience).moons).toEqual({});
  });

  it("marks a moon owner's moons opted out while the book shares", () => {
    const marks = popShareMarks(
      [pull(9, 2000, 555)],
      [{ corporationId: 555, popSharingOptOut: OPTED_OUT }],
      popSharingFrom({ enabled: true })
    );
    expect(marks.moons['9']).toEqual({ kind: 'opted-out' });
    expect(marks.structures['2000']).toEqual({ kind: 'opted-out' });
  });

  it('marks nothing opted out while the book shares nothing: the mark would be noise', () => {
    const marks = popShareMarks(
      [pull(9, 2000, 555)],
      [{ corporationId: 555, popSharingOptOut: OPTED_OUT }],
      popSharingFrom({ enabled: false })
    );
    expect(marks).toEqual({ moons: {}, structures: {}, owners: {} });
  });

  it('marks a moon owner by its moons: opted out, else every audience its shared moons reach', () => {
    const marks = popShareMarks(
      [pull(9, 2000, 555), pull(10, 2001, 555), pull(11, 2002, 556), pull(12, 2003, 557)],
      [
        { corporationId: 555 },
        { corporationId: 556, popSharingOptOut: OPTED_OUT },
        { corporationId: 557 },
        { corporationId: 558, popSharingOptOut: OPTED_OUT },
      ],
      popSharingFrom({
        enabled: true,
        moons: {
          '10': {
            audiences: [
              { kind: 'corp' },
              { kind: 'community', communityId: 'c1', name: 'Haulers' },
            ],
          },
          '12': { audiences: [] },
        },
      })
    );
    expect(marks.owners).toEqual({
      '555': {
        kind: 'shared',
        audiences: [{ kind: 'corp' }, { kind: 'community', communityId: 'c1', name: 'Haulers' }],
      },
      '556': { kind: 'opted-out' },
      '558': { kind: 'opted-out' },
    });
  });

  it('marks nothing for a moon owner the book no longer handles, as the server publishes nothing', () => {
    const marks = popShareMarks(
      [pull(9, 2000, 555), pull(10, 2001, 556)],
      [
        { corporationId: 555, status: 'left' as const },
        { corporationId: 556, status: 'removed' as const, popSharingOptOut: OPTED_OUT },
      ],
      popSharingFrom({ enabled: true })
    );
    expect(marks).toEqual({ moons: {}, structures: {}, owners: {} });
  });
});
