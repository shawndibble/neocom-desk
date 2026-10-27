import { describe, expect, it } from 'vitest';
import { quickPicks } from './quickPicks';

const hubs = [
  { systemId: 30000142, name: 'Jita' },
  { systemId: 30002187, name: 'Amarr' },
  { systemId: 30002659, name: 'Dodixie' },
];

describe('quickPicks', () => {
  it('lists the trade hubs in order, then the nearest incursion', () => {
    expect(
      quickPicks({
        hubs,
        incursion: { systemId: 5, name: 'Ibani' },
        taken: new Set(),
      })
    ).toEqual([
      { kind: 'hub', systemId: 30000142, name: 'Jita' },
      { kind: 'hub', systemId: 30002187, name: 'Amarr' },
      { kind: 'hub', systemId: 30002659, name: 'Dodixie' },
      { kind: 'incursion', systemId: 5, name: 'Ibani' },
    ]);
  });

  it('leaves out a system the trip already starts from or stops at', () => {
    const picks = quickPicks({
      hubs,
      incursion: { systemId: 5, name: 'Ibani' },
      taken: new Set([30000142, 5]),
    });
    expect(picks.map((pick) => pick.name)).toEqual(['Amarr', 'Dodixie']);
  });

  it('lists a hub once when the nearest incursion is staged in it', () => {
    const picks = quickPicks({
      hubs,
      incursion: { systemId: 30002187, name: 'Amarr' },
      taken: new Set(),
    });
    expect(picks.filter((pick) => pick.systemId === 30002187)).toEqual([
      { kind: 'hub', systemId: 30002187, name: 'Amarr' },
    ]);
  });

  it('has no incursion pick when none is nearby', () => {
    const picks = quickPicks({ hubs, incursion: null, taken: new Set() });
    expect(picks.some((pick) => pick.kind === 'incursion')).toBe(false);
  });
});
