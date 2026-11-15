import { describe, expect, it } from 'vitest';
import { popSharingFrom, type PopSharingDoc } from './popSharing.js';
import {
  OFFICER_WINDOW_MS,
  bookRatePctFor,
  buildSharedPops,
  editorStampsFrom,
  popExpiresAt,
  popInstant,
  popIsLive,
  qualifyingEditors,
  visiblePops,
  type BuildSharedPopsInput,
  type PopExtraction,
  type ViewerAccess,
} from './sharedPops.js';

const H = 3_600_000;
const START = '2026-11-10T00:00:00.000Z';
const ARRIVAL = '2026-11-15T00:00:00.000Z';
const DECAY = '2026-11-15T03:00:00.000Z';
const at = (iso: string, plusHours = 0) => Date.parse(iso) + plusHours * H;

const extraction = (over: Partial<PopExtraction> = {}): PopExtraction => ({
  id: `1000_${at(START)}`,
  structureId: 1000,
  moonId: 40001,
  extractionStartTime: START,
  chunkArrivalTime: ARRIVAL,
  naturalDecayTime: DECAY,
  oreLines: [{ typeId: 45490, quantity: 10_000 }],
  ...over,
});

const sharing = (over: Partial<PopSharingDoc> = {}): PopSharingDoc => ({
  ...popSharingFrom({ enabled: true }),
  ...over,
});

const input = (over: Partial<BuildSharedPopsInput> = {}): BuildSharedPopsInput => ({
  corporationId: 98000001,
  allianceId: 99000001,
  sharing: sharing(),
  extractions: [extraction()],
  owners: new Map(),
  expiryHours: {},
  bookRatePct: () => 10,
  refinery: () => ({ name: 'Tatara One', solarSystemId: 30000142 }),
  syncedAt: at('2026-11-14T12:00:00.000Z'),
  now: at(ARRIVAL, -24),
  ...over,
});

describe('popInstant', () => {
  it('is the chunk arrival for Ready and the natural decay for Auto-fracture', () => {
    expect(popInstant(extraction(), 'ready')).toBe(ARRIVAL);
    expect(popInstant(extraction(), 'auto-fracture')).toBe(DECAY);
  });

  it('moves to the actual fracture once the laser fired', () => {
    const fired = extraction({ laserFiredAt: '2026-11-15T01:00:00.000Z' });
    expect(popInstant(fired, 'ready')).toBe('2026-11-15T01:00:00.000Z');
    expect(popInstant(fired, 'auto-fracture')).toBe('2026-11-15T01:00:00.000Z');
  });
});

describe('pop lifetime', () => {
  it('expires 48 hours after the fracture by default, the refinery expiry when set, capped at 96', () => {
    expect(popExpiresAt(extraction(), {})).toBe(new Date(at(DECAY, 48)).toISOString());
    expect(popExpiresAt(extraction(), { '1000': 72 })).toBe(new Date(at(DECAY, 72)).toISOString());
    expect(popExpiresAt(extraction(), { '1000': 500 })).toBe(new Date(at(DECAY, 96)).toISOString());
    const fired = extraction({ laserFiredAt: '2026-11-15T01:00:00.000Z' });
    expect(popExpiresAt(fired, {})).toBe('2026-11-17T01:00:00.000Z');
  });

  it('lives from the Extraction start until Expired; a cancelled one never', () => {
    const x = extraction();
    expect(popIsLive(x, {}, at(START, -1))).toBe(false);
    expect(popIsLive(x, {}, at(START))).toBe(true);
    expect(popIsLive(x, {}, at(DECAY, 47))).toBe(true);
    expect(popIsLive(x, {}, at(DECAY, 48))).toBe(false);
    expect(popIsLive(extraction({ cancelledAt: START }), {}, at(START, 1))).toBe(false);
  });
});

describe('buildSharedPops', () => {
  it('publishes a live pop with refinery, Pop Time, ore, notes and the rate, never ISK', () => {
    const doc = buildSharedPops(
      input({
        sharing: sharing({
          defaults: { ...sharing().defaults, notes: 'Bring Orcas', ratePct: 7 },
        }),
      })
    );
    expect(doc).toMatchObject({
      corporationId: 98000001,
      allianceId: 99000001,
      corpShared: true,
      allianceShared: false,
      communityIds: [],
      syncedAt: at('2026-11-14T12:00:00.000Z'),
    });
    expect(doc!.pops).toEqual([
      {
        id: `98000001_1000_${at(START)}`,
        extractionId: `1000_${at(START)}`,
        moonId: 40001,
        structureId: 1000,
        refineryName: 'Tatara One',
        solarSystemId: 30000142,
        popTime: 'ready',
        popAt: ARRIVAL,
        fractured: false,
        startedAt: START,
        expiresAt: new Date(at(DECAY, 48)).toISOString(),
        ore: [{ typeId: 45490, quantity: 10_000 }],
        notes: 'Bring Orcas',
        ratePct: 7,
        audiences: ['corp'],
      },
    ]);
  });

  it('follows the book rate when the settings name none, and hides the ore when asked', () => {
    const doc = buildSharedPops(
      input({
        sharing: sharing({ moons: { '40001': { showOre: false } } }),
        bookRatePct: (x) => (x.moonId === 40001 ? 12 : 0),
      })
    );
    expect(doc!.pops[0]).toMatchObject({ ratePct: 12, ore: null });
  });

  it('publishes nothing with sharing off, no audience left, or nothing live', () => {
    expect(buildSharedPops(input({ sharing: sharing({ enabled: false }) }))).toBeNull();
    expect(
      buildSharedPops(input({ sharing: sharing({ moons: { '40001': { audiences: [] } } }) }))
    ).toBeNull();
    expect(buildSharedPops(input({ now: at(DECAY, 49) }))).toBeNull();
  });

  it("drops an opted-out moon owner's pops and a moon owner the book no longer handles", () => {
    const owned = extraction({ id: 'x2', moonId: 40002, sourceCorporationId: 98000555 });
    const both = [extraction(), owned];
    const shared = buildSharedPops(
      input({ extractions: both, owners: new Map([[98000555, { optedOut: false }]]) })
    );
    expect(shared!.pops.map((p) => p.extractionId)).toEqual([`1000_${at(START)}`, 'x2']);
    const optedOut = buildSharedPops(
      input({ extractions: both, owners: new Map([[98000555, { optedOut: true }]]) })
    );
    expect(optedOut!.pops.map((p) => p.extractionId)).toEqual([`1000_${at(START)}`]);
    const gone = buildSharedPops(input({ extractions: both, owners: new Map() }));
    expect(gone!.pops.map((p) => p.extractionId)).toEqual([`1000_${at(START)}`]);
  });

  it('lists the Communities and Alliance any pop names', () => {
    const doc = buildSharedPops(
      input({
        sharing: sharing({
          defaults: {
            ...sharing().defaults,
            audiences: [
              { kind: 'alliance' },
              { kind: 'community', communityId: 'c1', name: 'Ore' },
            ],
          },
        }),
      })
    );
    expect(doc).toMatchObject({
      corpShared: false,
      allianceShared: true,
      communityIds: ['c1'],
      communityNames: { c1: 'Ore' },
    });
    expect(doc!.pops[0].audiences).toEqual(['alliance', 'community:c1']);
  });
});

describe('visiblePops', () => {
  const doc = buildSharedPops(
    input({
      sharing: sharing({
        defaults: {
          ...sharing().defaults,
          audiences: [{ kind: 'corp' }],
        },
        moons: {
          '40002': {
            audiences: [
              { kind: 'alliance' },
              { kind: 'community', communityId: 'c1', name: 'Ore' },
            ],
          },
        },
      }),
      extractions: [extraction(), extraction({ id: 'x2', moonId: 40002 })],
    })
  )!;
  const viewer = (over: Partial<ViewerAccess> = {}): ViewerAccess => ({
    corporationIds: new Set(),
    allianceIds: new Set(),
    communityIds: new Set(),
    ...over,
  });
  const ids = (v: ViewerAccess, now = at(ARRIVAL)) =>
    visiblePops(doc, v, now).map((p) => p.extractionId);

  it('shows nothing to a pilot in no audience', () => {
    expect(ids(viewer({ corporationIds: new Set([98000555]), allianceIds: new Set([1]) }))).toEqual(
      []
    );
  });

  it("matches Corp and Alliance against the book's own corporation and alliance", () => {
    expect(ids(viewer({ corporationIds: new Set([98000001]) }))).toEqual([`1000_${at(START)}`]);
    expect(ids(viewer({ allianceIds: new Set([99000001]) }))).toEqual(['x2']);
  });

  it('matches a Community only when the caller counted it', () => {
    expect(ids(viewer({ communityIds: new Set(['c1']) }))).toEqual(['x2']);
  });

  it('drops a pop once it is Expired, even before the next publish', () => {
    expect(ids(viewer({ corporationIds: new Set([98000001]) }), at(DECAY, 48))).toEqual([]);
  });
});

describe('the Community officer rule', () => {
  const now = at(ARRIVAL);
  const stamp = { characterId: 1, ownerHash: 'h' };

  it('counts an editing use in the last 30 days with no failed role check since', () => {
    expect(qualifyingEditors([{ ...stamp, usedAt: now - H }], now)).toHaveLength(1);
    expect(qualifyingEditors([{ ...stamp, usedAt: now - OFFICER_WINDOW_MS }], now)).toEqual([]);
    expect(qualifyingEditors([{ ...stamp, usedAt: now - 2 * H, failedAt: now - H }], now)).toEqual(
      []
    );
    expect(
      qualifyingEditors([{ ...stamp, usedAt: now - H, failedAt: now - 2 * H }], now)
    ).toHaveLength(1);
  });

  it('reads stored stamps, dropping malformed ones', () => {
    expect(
      editorStampsFrom({
        editors: {
          'char:1': { characterId: 1, ownerHash: 'h', usedAt: 5, failedAt: 3 },
          'char:2': { characterId: 2, usedAt: 5 },
        },
      })
    ).toEqual([{ characterId: 1, ownerHash: 'h', usedAt: 5, failedAt: 3 }]);
    expect(editorStampsFrom(undefined)).toEqual([]);
  });
});

describe('bookRatePctFor', () => {
  const rates = [
    { scope: 'corp', pct: 10, effectiveFrom: '2026-01-01' },
    { scope: 'corp', pct: 12, effectiveFrom: '2026-11-01' },
    { scope: 'corp', pct: 99, effectiveFrom: '2027-01-01' },
    { scope: 'structure', structureId: 2000, pct: 8, effectiveFrom: '2026-01-01' },
    { scope: 'moon', moonId: 40003, pct: 5, effectiveFrom: '2026-01-01' },
    { scope: 'feeder', feederId: 98000555, pct: 15, effectiveFrom: '2026-01-01' },
  ];
  const today = '2026-11-15';

  it("reads the moon's rate, then its refinery's, then the moon owner's, then the corporation's in force", () => {
    expect(bookRatePctFor(rates, { moonId: 40003, structureId: 2000 }, today)).toBe(5);
    expect(bookRatePctFor(rates, { moonId: 40001, structureId: 2000 }, today)).toBe(8);
    expect(
      bookRatePctFor(rates, { moonId: 40001, structureId: 1, sourceCorporationId: 98000555 }, today)
    ).toBe(15);
    expect(bookRatePctFor(rates, { moonId: 40001, structureId: 1 }, today)).toBe(12);
    expect(bookRatePctFor([], { moonId: 40001, structureId: 1 }, today)).toBe(0);
  });
});
