import { describe, expect, it } from 'vitest';
import type { SharedPopView } from '@/sync/sharedPops';
import {
  popLinkCandidates,
  popSurveyDetails,
  popSurveyFill,
  strongPopMatch,
} from './popLinkCandidates';

const NOW = Date.parse('2026-11-20T12:00:00.000Z');
const H = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();

const BITUMENS = 45492;
const COBALTITE = 45494;
const ZEOLITES = 45493;
const BRIMFUL_BITUMENS = 46284;

function pop(over: Partial<SharedPopView> & { id: string }): SharedPopView {
  return {
    extractionId: over.id,
    moonId: 40001,
    structureId: 1_000_000_000_001,
    refineryName: 'Alpha Refinery',
    solarSystemId: 30000142,
    popTime: 'ready',
    popAt: iso(NOW - 2 * H),
    readyAt: iso(NOW - 2 * H),
    fractured: false,
    startedAt: iso(NOW - 40 * H),
    expiresAt: iso(NOW + 30 * H),
    ore: [
      { typeId: BITUMENS, quantity: 100 },
      { typeId: COBALTITE, quantity: 50 },
    ],
    notes: '',
    ratePct: 10,
    corporationId: 98000001,
    syncedAt: iso(NOW - H),
    ...over,
  } as SharedPopView;
}

const scan = (...ids: number[]) => new Set(ids);
const rank = (
  pops: SharedPopView[],
  ores = scan(BITUMENS, COBALTITE),
  location: { id: number | null; name: string } | null = null
) => popLinkCandidates({ pops, scanOreIds: ores, location, now: NOW });

describe('popLinkCandidates', () => {
  it('keeps a pop whose Ready time has passed', () => {
    expect(rank([pop({ id: 'a' })]).map((c) => c.pop.id)).toEqual(['a']);
  });

  it('drops a pop still extracting, one already linked, one Fully Mined, one no longer shown, and one Expired but still kept', () => {
    const pops = [
      pop({ id: 'extracting', readyAt: iso(NOW + H), popAt: iso(NOW + H) }),
      pop({ id: 'linked', surveyId: 'abc234' }),
      pop({ id: 'mined', fullyMined: { byName: 'Boss', at: iso(NOW - H) } }),
      pop({ id: 'gone', expiresAt: iso(NOW - H), retainUntil: iso(NOW - H) }),
      pop({ id: 'expired', expiresAt: iso(NOW - H), retainUntil: iso(NOW + 60 * H) }),
      pop({ id: 'ok' }),
    ];
    expect(rank(pops).map((c) => c.pop.id)).toEqual(['ok']);
  });

  it('measures Ready from the shared Ready time even when the pop is shown at auto-fracture', () => {
    const afterReady = pop({
      id: 'a',
      popTime: 'auto-fracture',
      readyAt: iso(NOW - 2 * H),
      autoFractureAt: iso(NOW + H),
      popAt: iso(NOW + H),
    });
    expect(rank([afterReady]).map((c) => c.pop.id)).toEqual(['a']);
  });

  it('filters by system when the Survey location is a solar system', () => {
    const pops = [
      pop({ id: 'here', solarSystemId: 30000142 }),
      pop({ id: 'there', solarSystemId: 30000144 }),
      pop({ id: 'unknown', solarSystemId: null }),
    ];
    const ids = rank(pops, scan(BITUMENS), { id: 30000142, name: 'Jita' }).map((c) => c.pop.id);
    expect(ids).toEqual(['here']);
  });

  it('filters by refinery when the Survey location is that structure', () => {
    const pops = [
      pop({ id: 'a', structureId: 1_000_000_000_001 }),
      pop({ id: 'b', structureId: 1_000_000_000_002 }),
    ];
    const ids = rank(pops, scan(BITUMENS), { id: 1_000_000_000_002, name: 'Beta' }).map(
      (c) => c.pop.id
    );
    expect(ids).toEqual(['b']);
  });

  it('applies no place filter for a manual name or a station it cannot place', () => {
    const pops = [pop({ id: 'a' }), pop({ id: 'b', solarSystemId: 30000144 })];
    expect(rank(pops, scan(BITUMENS), { id: null, name: 'my moon' })).toHaveLength(2);
    expect(rank(pops, scan(BITUMENS), { id: 60003760, name: 'Jita 4-4' })).toHaveLength(2);
  });

  it('scores by the overlap of base ores, so a variant matches its base', () => {
    const [c] = rank([pop({ id: 'a' })], scan(BRIMFUL_BITUMENS, COBALTITE));
    expect(c?.score).toBe(1);
  });

  it('ranks the closer ore match first, then the later pop, and drops a disjoint one', () => {
    const pops = [
      pop({
        id: 'half',
        ore: [
          { typeId: BITUMENS, quantity: 1 },
          { typeId: ZEOLITES, quantity: 1 },
        ],
      }),
      pop({ id: 'exactOld', readyAt: iso(NOW - 9 * H), popAt: iso(NOW - 9 * H) }),
      pop({ id: 'exactNew' }),
      pop({ id: 'disjoint', ore: [{ typeId: ZEOLITES, quantity: 1 }] }),
    ];
    expect(rank(pops).map((c) => c.pop.id)).toEqual(['exactNew', 'exactOld', 'half']);
  });

  it('keeps a pop that shares no ore make-up, unscored and last', () => {
    const pops = [
      pop({ id: 'hidden', ore: null }),
      pop({ id: 'half', ore: [{ typeId: BITUMENS, quantity: 1 }] }),
    ];
    const ranked = rank(pops);
    expect(ranked.map((c) => c.pop.id)).toEqual(['half', 'hidden']);
    expect(ranked[1]?.score).toBeNull();
  });
});

describe('strongPopMatch', () => {
  it('is the lone candidate whose ore set is identical to the scan', () => {
    const ranked = rank([
      pop({ id: 'a' }),
      pop({ id: 'b', ore: [{ typeId: BITUMENS, quantity: 1 }] }),
    ]);
    expect(strongPopMatch(ranked)?.pop.id).toBe('a');
  });

  it('is nothing when two candidates match identically', () => {
    expect(strongPopMatch(rank([pop({ id: 'a' }), pop({ id: 'b' })]))).toBeNull();
  });

  it('is nothing when the best candidate is only a partial match or unscored', () => {
    expect(
      strongPopMatch(rank([pop({ id: 'a', ore: [{ typeId: BITUMENS, quantity: 1 }] })]))
    ).toBeNull();
    expect(strongPopMatch(rank([pop({ id: 'a', ore: null })]))).toBeNull();
    expect(strongPopMatch([])).toBeNull();
  });
});

describe('popSurveyDetails', () => {
  it('takes the refinery as the place and the corporation at the pop rate as the payee', () => {
    const details = popSurveyDetails(pop({ id: 'a' }), 'Alpha Refinery', 'Mining Co');
    expect(details.place).toEqual({ id: 1_000_000_000_001, name: 'Alpha Refinery' });
    expect(details.payee).toEqual({ name: 'Mining Co', pct: 10 });
  });

  it('leaves out a place with no name and a payee known only by id', () => {
    const details = popSurveyDetails(pop({ id: 'a' }), null, '98000001');
    expect(details).toEqual({ place: null, payee: null });
  });
});

describe('popSurveyFill', () => {
  const details = popSurveyDetails(pop({ id: 'a' }), 'Alpha Refinery', 'Mining Co');

  it('fills a blank location and a blank tax', () => {
    expect(popSurveyFill(details, { location: null, tax: null })).toEqual({
      location: details.place,
      tax: details.payee,
    });
  });

  it('never overwrites what the pilot already set', () => {
    expect(
      popSurveyFill(details, {
        location: { id: null, name: 'my moon' },
        tax: { name: 'Me', pct: 5 },
      })
    ).toEqual({});
    expect(popSurveyFill(details, { location: { id: null, name: 'my moon' }, tax: null })).toEqual({
      tax: details.payee,
    });
  });
});
