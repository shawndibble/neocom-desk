import { describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import type { SpaceKind } from '@/engine/space';
import { formatCount } from '@/lib/formatCount';
import { formatIskCompact } from '@/lib/isk';
import { activeCourierFilters, type CourierUiFilter } from './courierFilterHelpers';
import { DEFAULT_COURIER_FILTER } from './courierFilterPref';

const DEFAULT: CourierUiFilter = { routeQuery: '', ...DEFAULT_COURIER_FILTER };
/** No NPC station sits in J-space, so the board offers the other three bands. */
const OFFERED: readonly SpaceKind[] = ['highsec', 'lowsec', 'nullsec'];
const names = {
  originRegions: [{ id: 10000002, name: 'The Forge' }],
  destinationRegions: [{ id: 10000043, name: 'Domain' }],
  spaceKinds: OFFERED,
};

describe('activeCourierFilters', () => {
  const pills = (over: Partial<CourierUiFilter>) =>
    activeCourierFilters({ ...DEFAULT, ...over }, i18n.t, names).map(({ label, value }) => [
      label,
      value,
    ]);

  it('is empty at the defaults', () => {
    expect(pills({})).toEqual([]);
  });

  it('never makes the route search a pill — its box shows it', () => {
    expect(pills({ routeQuery: 'jita' })).toEqual([]);
  });

  it('names each filter set, in the order a hauler reads a lane', () => {
    expect(
      pills({
        originRegionId: 10000002,
        destinationRegionId: 10000043,
        destinationSpace: ['highsec', 'lowsec'],
        minReward: '5000000',
        maxCollateral: '1000000000',
        maxVolume: '12500',
        minDays: '3',
        overRate: 'hide',
        hideUncompletable: true,
      })
    ).toEqual([
      ['From region', 'The Forge'],
      ['To region', 'Domain'],
      ['Destination space', 'Highsec, Lowsec'],
      ['Min reward', formatIskCompact(5_000_000)],
      ['Max collateral', formatIskCompact(1_000_000_000)],
      ['Max volume (m³)', formatCount(12_500)],
      ['Min days', formatCount(3)],
      ['Pay vs going rate', 'Hide far above'],
      ['Hide risky routes', undefined],
    ]);
  });

  it('shows a half-typed bound as typed rather than dropping it', () => {
    expect(pills({ minReward: '1e' })).toEqual([['Min reward', '1e']]);
  });

  it('ignores a whitespace-only bound', () => {
    expect(pills({ minReward: '  ' })).toEqual([]);
  });

  it('measures destination space against the bands on offer', () => {
    // Every offered band is no restriction, even with Wormhole unticked.
    expect(pills({ destinationSpace: OFFERED })).toEqual([]);
    expect(pills({ destinationSpace: ['nullsec'] })).toEqual([['Destination space', 'Nullsec']]);
    expect(pills({ destinationSpace: [] })).toEqual([['Destination space', 'None']]);
  });

  it('names an unknown region by its id', () => {
    expect(pills({ originRegionId: 1 })).toEqual([['From region', '#1']]);
  });

  it('each clear restores just its own default', () => {
    const filter: CourierUiFilter = {
      routeQuery: 'jita',
      originRegionId: 10000002,
      destinationRegionId: 10000043,
      destinationSpace: ['highsec'],
      hideUncompletable: true,
      overRate: 'only',
      minReward: '1e',
      maxCollateral: '1',
      maxVolume: '2',
      minDays: '3',
    };
    const active = activeCourierFilters(filter, i18n.t, names);
    expect(active).toHaveLength(9);
    for (const pill of active) {
      const cleared = pill.clear(filter);
      expect(cleared.routeQuery).toBe('jita');
      expect(activeCourierFilters(cleared, i18n.t, names).map((p) => p.label)).toEqual(
        active.filter((p) => p !== pill).map((p) => p.label)
      );
    }
    expect(active.reduce((value, pill) => pill.clear(value), filter)).toEqual({
      ...DEFAULT,
      routeQuery: 'jita',
    });
  });
});
