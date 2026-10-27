import { describe, expect, it } from 'vitest';
import { groupOf, spaceOfSystem, type GroupableRow } from './grouping';
import type { KillSummary } from './killActivity';

function summary(counts: Partial<Record<'highsec' | 'lowsec' | 'nullsec' | 'wormhole', number>>) {
  const make = (count = 0) => ({ count, lastMs: count > 0 ? 1 : null });
  const result: KillSummary = {
    bySpace: {
      highsec: make(counts.highsec),
      lowsec: make(counts.lowsec),
      nullsec: make(counts.nullsec),
      wormhole: make(counts.wormhole),
    },
    recentCount: Object.values(counts).reduce((a, b) => a + (b ?? 0), 0),
  };
  return result;
}

const row = (over: Partial<GroupableRow> = {}): GroupableRow => ({
  standing: null,
  ownOrganization: null,
  activity: summary({}),
  ...over,
});

describe('groupOf', () => {
  it('puts a red or orange contact first, whatever they have killed', () => {
    const orange = { band: 'orange', value: -5, via: 'corporation' } as const;
    expect(groupOf(row({ standing: orange, activity: summary({ nullsec: 3 }) }), 'highsec')).toBe(
      'marked'
    );
    expect(groupOf(row({ standing: { ...orange, band: 'red', value: -10 } }), 'highsec')).toBe(
      'marked'
    );
  });

  it('puts your corporation or alliance, and blue contacts, in friendly', () => {
    expect(groupOf(row({ ownOrganization: 'corporation' }), 'highsec')).toBe('friendly');
    expect(groupOf(row({ ownOrganization: 'alliance' }), 'highsec')).toBe('friendly');
    expect(
      groupOf(row({ standing: { band: 'blue', value: 5, via: 'character' } }), 'highsec')
    ).toBe('friendly');
  });

  it('lets your own organisation outrank a red contact on the same pilot', () => {
    expect(
      groupOf(
        row({
          ownOrganization: 'corporation',
          standing: { band: 'red', value: -10, via: 'character' },
        }),
        'highsec'
      )
    ).toBe('friendly');
  });

  it('keeps a neutral contact in the activity groups', () => {
    expect(
      groupOf(row({ standing: { band: 'neutral', value: 0, via: 'corporation' } }), 'highsec')
    ).toBe('quiet');
  });

  it('splits the rest by kills in the space you are in', () => {
    expect(groupOf(row({ activity: summary({ highsec: 1 }) }), 'highsec')).toBe('here');
    expect(groupOf(row({ activity: summary({ nullsec: 4 }) }), 'highsec')).toBe('elsewhere');
    expect(groupOf(row({ activity: summary({ nullsec: 4 }) }), 'nullsec')).toBe('here');
    expect(groupOf(row({ activity: summary({}) }), 'highsec')).toBe('quiet');
  });

  it('has no "here" when your system is not known', () => {
    expect(groupOf(row({ activity: summary({ highsec: 2 }) }), null)).toBe('elsewhere');
  });

  it('is pending until the kills arrive', () => {
    expect(groupOf(row({ activity: null }), 'highsec')).toBe('pending');
    // A contact standing needs no kills to place a pilot.
    expect(
      groupOf(
        row({ activity: null, standing: { band: 'red', value: -10, via: 'character' } }),
        'highsec'
      )
    ).toBe('marked');
  });
});

describe('spaceOfSystem', () => {
  it('bands by the status the game shows, and spots J-space by id', () => {
    expect(spaceOfSystem({ id: 30000142, security: 0.9459 })).toBe('highsec');
    expect(spaceOfSystem({ id: 1, security: 0.4608891 })).toBe('highsec');
    expect(spaceOfSystem({ id: 1, security: 0.3 })).toBe('lowsec');
    expect(spaceOfSystem({ id: 1, security: -0.2 })).toBe('nullsec');
    expect(spaceOfSystem({ id: 31000005, security: -0.99 })).toBe('wormhole');
    expect(spaceOfSystem(null)).toBeNull();
  });
});
