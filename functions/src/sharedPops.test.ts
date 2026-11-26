import { describe, expect, it } from 'vitest';
import { popSharingFrom, type PopSharingDoc } from './popSharing.js';
import {
  ALLIANCE_RECHECK_MS,
  OFFICER_WINDOW_MS,
  audienceCharacters,
  bookAllianceNow,
  bookRatePctFor,
  buildSharedPops,
  currentSharedPops,
  editorStampsFrom,
  movedPops,
  namedCommunityIds,
  popExpiresAt,
  popInstant,
  popIsLive,
  popIsRetained,
  POP_RETAIN_MS,
  qualifyingEditors,
  sharedPopsRepublishDue,
  visiblePops,
  type BuildSharedPopsInput,
  type PopExtraction,
  type SharedPopView,
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

describe('both Pop Times and retention (calendar dedupe, #pop-times)', () => {
  it('publishes the Ready and Auto-fracture instants whatever the officer chose', () => {
    const ready = buildSharedPops(input())!.pops[0];
    expect(ready.readyAt).toBe(ARRIVAL);
    expect(ready.autoFractureAt).toBe(DECAY);
    expect(ready.popAt).toBe(ARRIVAL);
    const auto = buildSharedPops(
      input({ sharing: sharing({ defaults: { ...sharing().defaults, popTime: 'auto-fracture' } }) })
    )!.pops[0];
    expect(auto.readyAt).toBe(ARRIVAL);
    expect(auto.autoFractureAt).toBe(DECAY);
  });

  it('collapses both to the actual fracture once the laser fired', () => {
    const fired = '2026-11-15T01:00:00.000Z';
    const pop = buildSharedPops(input({ extractions: [extraction({ laserFiredAt: fired })] }))!
      .pops[0];
    expect(pop.readyAt).toBe(fired);
    expect(pop.autoFractureAt).toBe(fired);
  });

  it('keeps a pop three days past its belt expiry, and says until when', () => {
    const x = extraction();
    const expiry = at(DECAY, 48);
    expect(popIsLive(x, {}, expiry)).toBe(false);
    expect(popIsRetained(x, {}, expiry)).toBe(true);
    expect(popIsRetained(x, {}, expiry + POP_RETAIN_MS - 1)).toBe(true);
    expect(popIsRetained(x, {}, expiry + POP_RETAIN_MS)).toBe(false);
    expect(popIsRetained(extraction({ cancelledAt: START }), {}, expiry)).toBe(false);
    const doc = buildSharedPops(input({ now: expiry + H }))!;
    expect(doc.pops[0].expiresAt).toBe(new Date(expiry).toISOString());
    expect(doc.pops[0].retainUntil).toBe(new Date(expiry + POP_RETAIN_MS).toISOString());
  });

  it('shows a retained pop to a viewer until its retainUntil, and an old pop until its expiresAt', () => {
    const expiry = at(DECAY, 48);
    const doc = buildSharedPops(input({ now: expiry + H }))!;
    const viewer: ViewerAccess = {
      corporationIds: new Set([98000001]),
      allianceIds: new Set(),
      communityIds: new Set(),
    };
    expect(visiblePops(doc, viewer, expiry + 2 * H)).toHaveLength(1);
    expect(visiblePops(doc, viewer, expiry + POP_RETAIN_MS)).toHaveLength(0);
    const old = { ...doc.pops[0], retainUntil: undefined };
    expect(visiblePops({ ...doc, pops: [old] }, viewer, expiry + H)).toHaveLength(0);
  });
});

describe('what a viewer is sent of the mining figures', () => {
  it('leaves the quantities out of the viewer type: they only feed the server quiet test', () => {
    const pop = buildSharedPops(
      input({
        now: at('2026-11-15T07:00:00.000Z'),
        extractions: [extraction({ laserFiredAt: '2026-11-15T01:00:00.000Z', minedQty: 9_500 })],
      })
    )!.pops[0];
    expect(pop.minedPct).toBe(95);
    // @ts-expect-error a viewer's pop carries no mined quantities
    const leaked: SharedPopView['minedPct'] = pop.minedPct;
    expect(leaked).toBe(95);
  });
});

describe('mining state', () => {
  const fired = '2026-11-15T01:00:00.000Z';
  const done = (over: Partial<PopExtraction> = {}) => extraction({ laserFiredAt: fired, ...over });
  const now = at(fired, 6);

  it("carries an officer's Fully Mined flag", () => {
    const flag = { byName: 'Mina', at: '2026-11-15T05:00:00.000Z' };
    const pop = buildSharedPops(input({ now, extractions: [done({ fullyMined: flag })] }))!.pops[0];
    expect(pop.fullyMined).toEqual(flag);
    expect(buildSharedPops(input({ now, extractions: [done()] }))!.pops[0]).not.toHaveProperty(
      'fullyMined'
    );
  });

  it('reports the share of the chunk mined, and when the figure last moved', () => {
    const first = buildSharedPops(input({ now, extractions: [done({ minedQty: 4_000 })] }))!
      .pops[0];
    expect(first.minedPct).toBe(40);
    expect(first.minedChangedAt).toBe(now);
    const unchanged = buildSharedPops(
      input({ now: now + H, extractions: [done({ minedQty: 4_000 })], heldPops: [first] })
    )!.pops[0];
    expect(unchanged.minedChangedAt).toBe(now);
    const moved = buildSharedPops(
      input({ now: now + H, extractions: [done({ minedQty: 5_000 })], heldPops: [first] })
    )!.pops[0];
    expect(moved.minedChangedAt).toBe(now + H);
  });

  it('says likely mined out at 90% with no change for 30 minutes, never when flagged', () => {
    const held = buildSharedPops(input({ now, extractions: [done({ minedQty: 9_200 })] }))!.pops[0];
    expect(held.likelyMinedOut).toBeUndefined();
    const later = (over: Partial<PopExtraction>, ms: number) =>
      buildSharedPops(
        input({
          now: now + ms,
          extractions: [done({ minedQty: 9_200, ...over })],
          heldPops: [held],
        })
      )!.pops[0];
    expect(later({}, 29 * 60_000).likelyMinedOut).toBeUndefined();
    expect(later({}, 30 * 60_000).likelyMinedOut).toBe(true);
    expect(
      later({ fullyMined: { byName: 'Mina', at: fired } }, 30 * 60_000).likelyMinedOut
    ).toBeUndefined();
    expect(later({ minedQty: 8_000 }, 30 * 60_000).likelyMinedOut).toBeUndefined();
  });

  it('says nothing without a chunk make-up or ledger rows', () => {
    const noOre = buildSharedPops(
      input({ now, extractions: [done({ oreLines: undefined, minedQty: 5 })] })
    )!.pops[0];
    expect(noOre).not.toHaveProperty('minedPct');
    expect(buildSharedPops(input({ now, extractions: [done()] }))!.pops[0]).not.toHaveProperty(
      'minedPct'
    );
  });
});

describe('buildSharedPops', () => {
  it('carries the Survey an officer linked to the Extraction, and none when unlinked', () => {
    const linked = buildSharedPops(input({ extractions: [extraction({ surveyId: 'abc123' })] }));
    expect(linked!.pops[0].surveyId).toBe('abc123');
    const plain = buildSharedPops(input());
    expect(plain!.pops[0]).not.toHaveProperty('surveyId');
    const hidden = buildSharedPops(
      input({
        sharing: sharing({ defaults: { ...sharing().defaults, showOre: false } }),
        extractions: [extraction({ surveyId: 'abc123' })],
      })
    );
    expect(hidden!.pops[0]).not.toHaveProperty('surveyId');
  });

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
        readyAt: ARRIVAL,
        autoFractureAt: DECAY,
        fractured: false,
        startedAt: START,
        expiresAt: new Date(at(DECAY, 48)).toISOString(),
        retainUntil: new Date(at(DECAY, 48 + 72)).toISOString(),
        ore: [{ typeId: 45490, quantity: 10_000 }],
        oreShared: true,
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
    expect(doc!.pops[0]).toMatchObject({ ratePct: 12, ore: null, oreShared: false });
  });

  it('says the ore make-up is shared but unknown when the book holds none (a moon owner)', () => {
    const doc = buildSharedPops(input({ extractions: [extraction({ oreLines: undefined })] }));
    expect(doc!.pops[0]).toMatchObject({ ore: null, oreShared: true });
  });

  it('publishes nothing with sharing off, no audience left, or nothing live', () => {
    expect(buildSharedPops(input({ sharing: sharing({ enabled: false }) }))).toBeNull();
    expect(
      buildSharedPops(input({ sharing: sharing({ moons: { '40001': { audiences: [] } } }) }))
    ).toBeNull();
    expect(buildSharedPops(input({ now: at(DECAY, 48 + 72) }))).toBeNull();
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

describe('currentSharedPops', () => {
  const OWNER = 98000555;
  const owned = extraction({ id: 'x2', moonId: 40002, sourceCorporationId: OWNER });
  const handled = new Map([[OWNER, { optedOut: false }]]);
  const published = buildSharedPops(
    input({ extractions: [extraction(), owned], owners: handled })
  )!;
  const book = (over: Partial<Parameters<typeof currentSharedPops>[1]> = {}) => ({
    active: true,
    sharing: sharing(),
    owners: handled,
    ...over,
  });
  const ids = (doc: ReturnType<typeof currentSharedPops>) =>
    doc?.pops.map((p) => p.extractionId) ?? null;

  it("marks a moon owner's pop with its owner, and the book's own pop with none", () => {
    expect(published.pops.map((p) => p.ownerCorporationId)).toEqual([undefined, OWNER]);
  });

  it('keeps every pop the settings still allow', () => {
    expect(ids(currentSharedPops(published, book()))).toEqual([`1000_${at(START)}`, 'x2']);
  });

  it('drops everything once sharing is off or the book is inactive, whatever the doc says', () => {
    expect(currentSharedPops(published, book({ sharing: sharing({ enabled: false }) }))).toBeNull();
    expect(currentSharedPops(published, book({ active: false }))).toBeNull();
  });

  it("drops an opted-out moon owner's pops, and an owner the book no longer handles", () => {
    const optedOut = new Map([[OWNER, { optedOut: true }]]);
    expect(ids(currentSharedPops(published, book({ owners: optedOut })))).toEqual([
      `1000_${at(START)}`,
    ]);
    expect(ids(currentSharedPops(published, book({ owners: new Map() })))).toEqual([
      `1000_${at(START)}`,
    ]);
  });

  it('drops an audience the settings no longer name, and a pop left with none', () => {
    const twoAudiences = sharing({
      defaults: { ...sharing().defaults, audiences: [{ kind: 'corp' }, { kind: 'alliance' }] },
    });
    const doc = buildSharedPops(input({ sharing: twoAudiences }))!;
    expect(currentSharedPops(doc, book())!.pops[0].audiences).toEqual(['corp']);
    const allianceOnly = sharing({
      defaults: { ...sharing().defaults, audiences: [{ kind: 'alliance' }] },
    });
    expect(currentSharedPops(published, book({ sharing: allianceOnly }))).toBeNull();
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

  it('drops a pop once its retention ends, even before the next publish', () => {
    const corp = viewer({ corporationIds: new Set([98000001]) });
    expect(ids(corp, at(DECAY, 48))).toEqual([`1000_${at(START)}`]);
    expect(ids(corp, at(DECAY, 48 + 72))).toEqual([]);
  });

  it("names which of the viewer's Characters are in each pop's audience (issue #6225)", () => {
    const characters = [
      { characterId: 1, access: viewer({ corporationIds: new Set([98000001]) }) },
      { characterId: 2, access: viewer({ allianceIds: new Set([99000001]) }) },
      { characterId: 3, access: viewer({ communityIds: new Set(['c1']) }) },
    ];
    const [corpPop, alliancePop] = doc.pops;
    expect(audienceCharacters(doc, corpPop, characters)).toEqual([1]);
    expect(audienceCharacters(doc, alliancePop, characters)).toEqual([2, 3]);
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

describe('movedPops', () => {
  const pops = (over: Partial<PopExtraction> = {}) =>
    buildSharedPops(input({ extractions: [extraction(over)] }))!.pops;

  it('names a pop whose time moved, such as an early fracture, with its new time', () => {
    const fired = '2026-11-15T01:10:00.000Z';
    expect(movedPops(pops(), pops({ laserFiredAt: fired }))).toEqual([
      { id: pops()[0].id, popAtMs: Date.parse(fired) },
    ]);
  });

  it('names nothing when no time moved, or the pop was not published before', () => {
    expect(movedPops(pops(), pops())).toEqual([]);
    expect(movedPops(undefined, pops())).toEqual([]);
    expect(movedPops([], pops({ laserFiredAt: ARRIVAL }))).toEqual([]);
  });
});

describe('bookAllianceNow', () => {
  const BOOK = 98000001;

  it("reads the book's alliance off any Character in its corporation now", () => {
    expect(
      bookAllianceNow(BOOK, 99000001, [
        { corporationId: 98000777, allianceId: 99000001 },
        { corporationId: BOOK, allianceId: null },
      ])
    ).toBeNull();
    expect(bookAllianceNow(BOOK, null, [{ corporationId: BOOK, allianceId: 99000002 }])).toBe(
      99000002
    );
  });

  it('keeps the alliance last published when no Character in the corporation is known', () => {
    expect(bookAllianceNow(BOOK, 99000001, [{ corporationId: 98000777, allianceId: null }])).toBe(
      99000001
    );
  });
});

describe('namedCommunityIds', () => {
  const community = (communityId: string) => ({
    kind: 'community' as const,
    communityId,
    name: communityId,
  });

  it('lists the Communities the default and every Moon override name, once, while sharing is on', () => {
    const doc = sharing({
      defaults: { ...sharing().defaults, audiences: [community('c2'), { kind: 'corp' }] },
      moons: { '7': { audiences: [community('c1'), community('c2')] } },
    });
    expect(namedCommunityIds(doc)).toEqual(['c1', 'c2']);
    expect(namedCommunityIds({ ...doc, enabled: false })).toEqual([]);
  });
});

describe('sharedPopsRepublishDue', () => {
  const now = at(ARRIVAL);
  const held = (hoursAgo: number, allianceId: number | null = 99) => ({
    publishedAtMs: now - hoursAgo * H,
    allianceId,
  });

  it('republishes after a sync that changed something', () => {
    expect(sharedPopsRepublishDue({ changed: true, held: held(0), allianceNow: 99, now })).toBe(
      true
    );
    expect(sharedPopsRepublishDue({ changed: true, held: null, now })).toBe(true);
  });

  it('holds a quiet sync until the published doc is an alliance recheck old', () => {
    expect(sharedPopsRepublishDue({ changed: false, held: held(1), allianceNow: 99, now })).toBe(
      false
    );
    expect(
      sharedPopsRepublishDue({
        changed: false,
        held: { publishedAtMs: now - ALLIANCE_RECHECK_MS, allianceId: 99 },
        now,
      })
    ).toBe(true);
    expect(
      sharedPopsRepublishDue({
        changed: false,
        held: { publishedAtMs: undefined, allianceId: 99 },
        now,
      })
    ).toBe(true);
  });

  it('republishes at once when the corporation joined, left or changed alliance', () => {
    expect(
      sharedPopsRepublishDue({ changed: false, held: held(1, null), allianceNow: 7, now })
    ).toBe(true);
    expect(
      sharedPopsRepublishDue({ changed: false, held: held(1, 99), allianceNow: null, now })
    ).toBe(true);
    expect(sharedPopsRepublishDue({ changed: false, held: held(1, 99), allianceNow: 7, now })).toBe(
      true
    );
  });

  it('keeps the throttle when the alliance could not be read', () => {
    expect(sharedPopsRepublishDue({ changed: false, held: held(1), now })).toBe(false);
  });

  it('publishes nothing for a quiet sync with no doc held', () => {
    expect(sharedPopsRepublishDue({ changed: false, held: null, allianceNow: 7, now })).toBe(false);
  });
});
