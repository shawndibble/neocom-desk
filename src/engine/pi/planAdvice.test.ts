import { describe, it, expect } from 'vitest';
import {
  buildSteps,
  colonyAdvice,
  isSaving,
  orderQuickWins,
  pickRebuild,
  planTotals,
  quickWin,
  quickWinMinutes,
  sellBooks,
  slotNudge,
  spendRoomOnce,
  totalQuickWins,
  type RebuildCandidate,
  type RebuildFacts,
} from './planAdvice';

const HUB = {
  prices: { 1: 110, 2: 220 },
  revenuePrices: { 1: 100, 2: 200 },
  salesTaxPct: 3.6,
};

describe('sellBooks', () => {
  it('leaves hub books alone', () => {
    expect(sellBooks(HUB, { kind: 'hub' })).toEqual(HUB);
  });

  it('prices a corp buyback at a share of the hub sale price, with no sales tax', () => {
    const books = sellBooks(HUB, { kind: 'buyback', pct: 90 });
    expect(books.revenuePrices).toEqual({ 1: 90, 2: 180 });
    expect(books.salesTaxPct).toBe(0);
  });

  it('keeps what buying costs at the hub, since a buyback only changes what a sale earns', () => {
    expect(sellBooks(HUB, { kind: 'buyback', pct: 90 }).prices).toEqual(HUB.prices);
  });

  it('refuses a buyback share that is not a share', () => {
    for (const pct of [0, -5, 101, Number.NaN]) {
      expect(() => sellBooks(HUB, { kind: 'buyback', pct })).toThrow(RangeError);
    }
  });
});

describe('quick wins', () => {
  const restart = (planetId: number, gain: number | null, extractors = 1) =>
    quickWin(
      planetId,
      { kind: 'restart', reason: 'stopped', extractors, resourceTypeIds: [1] },
      gain
    );

  it('has a stable id from the planet, the kind and what it acts on', () => {
    expect(restart(7, 100).id).toBe('7:restart-stopped');
    expect(
      quickWin(7, { kind: 'restart', reason: 'decayed', extractors: 1, resourceTypeIds: [1] }, 1).id
    ).toBe('7:restart-decayed');
    expect(
      quickWin(
        7,
        {
          kind: 'spare-room',
          what: 'factories',
          productTypeId: 99,
          factories: 1,
          source: 'network',
          routedFrom: [],
          needsRemoval: false,
        },
        1
      ).id
    ).toBe('7:room-factories:99');
  });

  it('estimates minutes from one named table, more for more pins', () => {
    expect(
      quickWinMinutes({ kind: 'restart', reason: 'stopped', extractors: 1, resourceTypeIds: [] })
    ).toBe(2);
    expect(
      quickWinMinutes({ kind: 'restart', reason: 'stopped', extractors: 3, resourceTypeIds: [] })
    ).toBe(4);
    expect(quickWinMinutes({ kind: 'storage', hoursToFull: 5, haulHours: 24 })).toBe(3);
  });

  it('is worth its gain per minute of work', () => {
    const win = restart(1, 1200);
    expect(win.minutes).toBe(2);
    expect(win.iskPerMinute).toBe(600);
  });

  it('orders by ISK per minute, so a quick small job can lead a slow big one', () => {
    const big = restart(1, 10_000, 9); // 10 min -> 1,000 a minute
    const small = restart(2, 3_000, 1); // 2 min -> 1,500 a minute
    expect(orderQuickWins([big, small]).map((w) => w.planetId)).toEqual([2, 1]);
  });

  it('puts a win with no figure after every priced one, never in the middle as a zero', () => {
    const unpriced = restart(1, null);
    const tiny = restart(2, 10);
    expect(unpriced.iskPerMinute).toBeNull();
    expect(orderQuickWins([unpriced, tiny]).map((w) => w.planetId)).toEqual([2, 1]);
  });

  it('breaks ties by id so a refresh never reshuffles equal wins', () => {
    const a = restart(3, 100);
    const b = restart(2, 100);
    expect(orderQuickWins([a, b]).map((w) => w.planetId)).toEqual([2, 3]);
  });

  it('totals the priced gain and counts the unpriced apart', () => {
    expect(totalQuickWins([restart(1, 100), restart(2, null), restart(3, 50)])).toEqual({
      gainPerDay: 150,
      minutes: 6,
      unpriced: 1,
    });
  });

  it('leaves out of the total what a storage win saves, but counts its minutes', () => {
    const storage = quickWin(4, { kind: 'storage', hoursToFull: 5, haulHours: 24 }, 80_000);
    expect(isSaving(storage.detail)).toBe(true);
    expect(isSaving(restart(1, 100).detail)).toBe(false);
    expect(totalQuickWins([restart(1, 100), storage])).toEqual({
      gainPerDay: 100,
      minutes: 5,
      unpriced: 0,
    });
    // A saving with no figure is not an unpriced addition either.
    expect(
      totalQuickWins([quickWin(4, { kind: 'storage', hoursToFull: 5, haulHours: 24 }, null)])
        .unpriced
    ).toBe(0);
  });
});

describe('spendRoomOnce', () => {
  const PLANET = 7;
  const heads = (gain: number | null, headsToAdd: number | null = 6) =>
    quickWin(
      PLANET,
      {
        kind: 'idle-factories',
        pinCount: 3,
        freed: { cpu: 600, powergrid: 2_400 },
        wouldFeed: 3,
        headsToAdd,
        resourceTypeId: 1,
      },
      gain
    );
  const factory = (productTypeId: number, gain: number | null, source: 'local' | 'network') =>
    quickWin(
      PLANET,
      {
        kind: 'spare-room',
        what: 'factories',
        productTypeId,
        factories: 1,
        source,
        routedFrom: source === 'network' ? [8] : [],
        needsRemoval: true,
      },
      gain
    );
  const extractors = (gain: number | null) =>
    quickWin(
      PLANET,
      { kind: 'spare-room', what: 'extractors', extraEcus: 1, resourceTypeId: 1 },
      gain
    );
  const restart = quickWin(
    PLANET,
    { kind: 'restart', reason: 'stopped', extractors: 1, resourceTypeIds: [1] },
    50_000
  );
  const ids = (wins: readonly { id: string }[]) => wins.map((win) => win.id);

  it('keeps one claim on the freed room, the one that earns more (Uttindar V)', () => {
    const kept = spendRoomOnce([heads(2_040_000), factory(2319, 935_000, 'network')]);
    expect(ids(kept)).toEqual([`${PLANET}:idle`]);
    expect(totalQuickWins(kept).gainPerDay).toBe(2_040_000);
  });

  it('still names idle factories for removal when their heads lose the room', () => {
    const kept = spendRoomOnce([heads(500_000), factory(2319, 935_000, 'network')]);
    expect(ids(kept)).toEqual([`${PLANET}:idle`, `${PLANET}:room-factories:2319`]);
    expect(kept[0].detail).toMatchObject({ kind: 'idle-factories', headsToAdd: null });
    expect(kept[0].gainPerDay).toBeNull();
    expect(totalQuickWins(kept).gainPerDay).toBe(935_000);
  });

  it('counts one source’s factories together, since it split the room between them', () => {
    const kept = spendRoomOnce([
      heads(1_000_000),
      factory(2319, 600_000, 'network'),
      factory(2312, 600_000, 'network'),
    ]);
    expect(totalQuickWins(kept).gainPerDay).toBe(1_200_000);
  });

  it('never counts local refining and the network plan’s factories on the same room', () => {
    const kept = spendRoomOnce([
      factory(2393, 400_000, 'local'),
      factory(2319, 900_000, 'network'),
    ]);
    expect(ids(kept)).toEqual([`${PLANET}:room-factories:2319`]);
  });

  it('spends plain headroom once too: more extractors or a new factory, not both', () => {
    expect(ids(spendRoomOnce([extractors(300_000), factory(2319, 200_000, 'local')]))).toEqual([
      `${PLANET}:room-extractors`,
    ]);
  });

  it('prefers a claim with a figure over one without', () => {
    const kept = spendRoomOnce([heads(null), factory(2319, 10, 'network')]);
    expect(totalQuickWins(kept)).toMatchObject({ gainPerDay: 10, unpriced: 1 });
    expect(kept[0].detail).toMatchObject({ headsToAdd: null });
  });

  it('leaves alone what spends no room: a restart, storage, factories removed without heads', () => {
    const removeOnly = heads(null, null);
    const storage = quickWin(PLANET, { kind: 'storage', hoursToFull: 5, haulHours: 24 }, 1);
    const wins = [restart, storage, removeOnly, factory(2319, 935_000, 'network')];
    expect(spendRoomOnce(wins)).toEqual(wins);
  });

  it('settles each colony on its own', () => {
    const other = quickWin(
      9,
      { kind: 'spare-room', what: 'extractors', extraEcus: 1, resourceTypeId: 1 },
      5
    );
    expect(ids(spendRoomOnce([heads(2_000_000), other]))).toEqual([
      `${PLANET}:idle`,
      '9:room-extractors',
    ]);
  });
});

const cand = (
  typeId: number,
  tier: 1 | 2,
  iskPerDay: number,
  m3PerDay: number,
  extra: Partial<RebuildCandidate> = {}
): RebuildCandidate => ({
  typeId,
  name: `Recipe ${typeId}`,
  tier,
  iskPerDay,
  m3PerDay,
  unitsPerDay: 1,
  pins: { extractorControlUnit: 1, basic: 2 },
  recipe: { extracts: [900], makes: [{ typeId, facility: 'basic' }] },
  needsCcLevel: null,
  ...extra,
});

const facts = (
  candidates: RebuildCandidate[],
  extra: Partial<RebuildFacts> = {}
): RebuildFacts => ({
  planetId: 1,
  planetType: 'barren',
  colonyCcLevel: 4,
  currentProductTypeIds: [],
  currentPins: {},
  todayM3PerDay: 100,
  candidates,
  ...extra,
});

describe('pickRebuild', () => {
  it('changes to the best recipe and quotes the gain over today after quick wins', () => {
    const result = pickRebuild(
      facts([cand(10, 1, 120_000, 50), cand(20, 2, 150_000, 20)]),
      100_000,
      'isk'
    );
    expect(result.status).toBe('change');
    if (result.status !== 'change') return;
    expect(result.pick.typeId).toBe(20);
    expect(result.gainPerDay).toBe(50_000);
    expect(result.todayPerDay).toBe(100_000);
  });

  it('never picks raw P0, nor anything above P2', () => {
    const result = pickRebuild(
      facts([
        cand(1, 0 as unknown as 1, 999_999, 1),
        cand(3, 3 as unknown as 2, 999_999, 1),
        cand(10, 1, 120_000, 50),
      ]),
      100_000,
      'isk'
    );
    expect(result.status === 'change' && result.pick.typeId).toBe(10);
  });

  it('keeps when the colony already runs the best recipe', () => {
    const result = pickRebuild(
      facts([cand(10, 1, 120_000, 50)], { currentProductTypeIds: [10] }),
      119_000,
      'isk'
    );
    expect(result).toMatchObject({ status: 'keep', reason: 'already-best' });
  });

  it('keeps when the best recipe earns about what the colony does now', () => {
    const result = pickRebuild(facts([cand(10, 1, 103_000, 50)]), 100_000, 'isk');
    expect(result).toMatchObject({ status: 'keep', reason: 'gain-too-small' });
  });

  it('keeps when nothing profitable can be built here', () => {
    const result = pickRebuild(facts([]), 100_000, 'isk');
    expect(result).toMatchObject({ status: 'keep', reason: 'no-candidates', best: null });
  });

  it('measures the rebuild against today after quick wins, so a quick win is not counted twice', () => {
    const candidates = [cand(10, 1, 130_000, 50)];
    const withoutWins = pickRebuild(facts(candidates), 100_000, 'isk');
    const withWins = pickRebuild(facts(candidates), 120_000, 'isk');
    expect(withoutWins.status === 'change' && withoutWins.gainPerDay).toBe(30_000);
    expect(withWins.status === 'change' && withWins.gainPerDay).toBe(10_000);
  });

  it('re-picks the recipe that hauls least when asked to, among the ones worth running', () => {
    const candidates = [
      cand(10, 1, 150_000, 80), // most ISK, most hauling
      cand(20, 2, 120_000, 20), // least hauling worth running
      cand(30, 2, 20_000, 1), // barely any hauling, but earns almost nothing
    ];
    const isk = pickRebuild(facts(candidates), 90_000, 'isk');
    const haul = pickRebuild(facts(candidates), 90_000, 'haul');
    expect(isk.status === 'change' && isk.pick.typeId).toBe(10);
    expect(haul.status === 'change' && haul.pick.typeId).toBe(20);
  });

  it('offers the other preference as its one alternative', () => {
    const candidates = [cand(10, 1, 150_000, 80), cand(20, 2, 120_000, 20)];
    const isk = pickRebuild(facts(candidates), 90_000, 'isk');
    expect(isk.alternative?.typeId).toBe(20);
    const haul = pickRebuild(facts(candidates), 90_000, 'haul');
    expect(haul.alternative?.typeId).toBe(10);
  });

  it('falls to the runner-up as the alternative when both preferences agree', () => {
    const candidates = [cand(10, 2, 150_000, 20), cand(20, 1, 120_000, 80)];
    const result = pickRebuild(facts(candidates), 90_000, 'isk');
    expect(result.status === 'change' && result.pick.typeId).toBe(10);
    expect(result.alternative?.typeId).toBe(20);
  });

  it('has no alternative when there is only one recipe', () => {
    expect(pickRebuild(facts([cand(10, 1, 150_000, 20)]), 90_000, 'isk').alternative).toBeNull();
  });

  it('keeps under least hauling when the colony already hauls about as little as the pick', () => {
    const result = pickRebuild(
      facts([cand(20, 2, 95_000, 99)], { todayM3PerDay: 100 }),
      90_000,
      'haul'
    );
    expect(result).toMatchObject({ status: 'keep' });
  });

  it('adds an upgrade-first step when the Command Center level is too low for the recipe', () => {
    const result = pickRebuild(
      facts([cand(10, 2, 200_000, 20, { needsCcLevel: 5 })], { colonyCcLevel: 3 }),
      100_000,
      'isk'
    );
    expect(result.status).toBe('change');
    if (result.status !== 'change') return;
    expect(result.upgradeFromLevel).toBe(3);
    expect(result.steps[0]).toMatchObject({ verb: 'upgrade', fromLevel: 3, toLevel: 5 });
  });

  it('adds no upgrade step when the recipe fits the level the colony has', () => {
    const result = pickRebuild(facts([cand(10, 2, 200_000, 20)]), 100_000, 'isk');
    expect(result.status === 'change' && result.upgradeFromLevel).toBeNull();
  });

  it('breaks an equal figure toward the shallower tier, then the lower type id', () => {
    const result = pickRebuild(
      facts([cand(30, 2, 200_000, 5), cand(20, 2, 200_000, 5), cand(40, 1, 200_000, 5)]),
      100_000,
      'isk'
    );
    expect(result.status === 'change' && result.pick.typeId).toBe(40);
  });
});

describe('buildSteps', () => {
  it('removes what the new layout does not need, places what it does, sets and routes', () => {
    const candidate = cand(10, 2, 1, 1, {
      pins: { extractorControlUnit: 2, basic: 2, advanced: 1 },
      recipe: {
        extracts: [900, 901],
        makes: [
          { typeId: 11, facility: 'basic' },
          { typeId: 12, facility: 'basic' },
          { typeId: 10, facility: 'advanced' },
        ],
      },
    });
    const { steps, minutes } = buildSteps(candidate, {
      currentPins: { extractorControlUnit: 3, basic: 1, advanced: 0, storage: 1 },
      fromLevel: 4,
    });
    const find = (verb: string, pin?: string) =>
      steps.filter((s) => s.verb === verb && (pin === undefined || ('pin' in s && s.pin === pin)));
    expect(find('remove', 'extractorControlUnit')[0]).toMatchObject({ count: 1 });
    expect(find('remove', 'basic')).toHaveLength(0);
    expect(find('place', 'basic')[0]).toMatchObject({ count: 1 });
    expect(find('place', 'advanced')[0]).toMatchObject({ count: 1 });
    expect(find('place', 'storage')).toHaveLength(0);
    expect(find('set')).toHaveLength(2 + 3);
    expect(find('route')[0]).toMatchObject({ count: 5 });
    expect(minutes).toBeGreaterThan(0);
    expect(steps.map((s) => s.verb)).toEqual(
      [...steps.map((s) => s.verb)].sort(
        (a, b) =>
          ['upgrade', 'remove', 'place', 'set', 'route'].indexOf(a) -
          ['upgrade', 'remove', 'place', 'set', 'route'].indexOf(b)
      )
    );
  });
});

describe('colonyAdvice', () => {
  const win = (gain: number | null) =>
    quickWin(1, { kind: 'restart', reason: 'stopped', extractors: 1, resourceTypeIds: [] }, gain);

  it('adds the priced quick wins to today and stacks the rebuild on top', () => {
    const advice = colonyAdvice({
      planetId: 1,
      planetType: 'barren',
      todayPerDay: 100_000,
      quickWins: [win(20_000), win(null)],
      rebuild: facts([cand(10, 2, 160_000, 5)]),
      preference: 'isk',
    });
    expect(advice.afterQuickWinsPerDay).toBe(120_000);
    expect(advice.rebuild.status).toBe('change');
    expect(advice.afterRebuildPerDay).toBe(160_000);
  });

  it('shows what a storage win saves without adding it to the colony after its quick wins', () => {
    const advice = colonyAdvice({
      planetId: 1,
      planetType: 'barren',
      todayPerDay: 100_000,
      quickWins: [
        win(20_000),
        quickWin(1, { kind: 'storage', hoursToFull: 5, haulHours: 24 }, 30_000),
      ],
      rebuild: { refused: 'needs-link-cost' },
      preference: 'isk',
    });
    expect(advice.quickWins).toHaveLength(2);
    expect(advice.quickWinGainPerDay).toBe(20_000);
    expect(advice.afterQuickWinsPerDay).toBe(120_000);
  });

  it('has no figures, rather than zeros, for a colony whose income is unknown', () => {
    const advice = colonyAdvice({
      planetId: 1,
      planetType: 'barren',
      todayPerDay: null,
      unknownReason: 'no-measured-extraction',
      quickWins: [],
      rebuild: { refused: 'needs-measured-extraction' },
      preference: 'isk',
    });
    expect(advice.todayPerDay).toBeNull();
    expect(advice.afterQuickWinsPerDay).toBeNull();
    expect(advice.afterRebuildPerDay).toBeNull();
    expect(advice.rebuild).toEqual({
      status: 'refused',
      planetId: 1,
      reason: 'needs-measured-extraction',
    });
  });

  it('refuses a rebuild it cannot compare with an unknown today', () => {
    const advice = colonyAdvice({
      planetId: 1,
      planetType: 'barren',
      todayPerDay: null,
      unknownReason: 'unpriced',
      quickWins: [],
      rebuild: facts([cand(10, 1, 150_000, 5)]),
      preference: 'isk',
    });
    expect(advice.rebuild).toMatchObject({ status: 'refused', reason: 'needs-today' });
  });

  it('orders its own quick wins by ISK per minute', () => {
    const advice = colonyAdvice({
      planetId: 1,
      planetType: 'barren',
      todayPerDay: 1,
      quickWins: [
        quickWin(
          1,
          { kind: 'restart', reason: 'stopped', extractors: 9, resourceTypeIds: [] },
          1000
        ),
        quickWin(1, { kind: 'storage', hoursToFull: 1, haulHours: 24 }, 1000),
      ],
      rebuild: { refused: 'needs-link-cost' },
      preference: 'isk',
    });
    expect(advice.quickWins.map((w) => w.detail.kind)).toEqual(['storage', 'restart']);
  });
});

describe('planTotals', () => {
  const line = (today: number | null, wins: number, rebuildGain: number, minutes = 0) =>
    colonyAdvice({
      planetId: 1,
      planetType: 'barren',
      todayPerDay: today,
      quickWins: wins
        ? [
            quickWin(
              1,
              { kind: 'restart', reason: 'stopped', extractors: 1, resourceTypeIds: [] },
              wins
            ),
          ]
        : [],
      rebuild: rebuildGain
        ? facts([cand(10, 2, (today ?? 0) + wins + rebuildGain, 1)], {
            currentPins: { basic: minutes },
          })
        : { refused: 'needs-link-cost' },
      preference: 'isk',
    });

  it('sums today, after quick wins and after rebuild across the known colonies', () => {
    const totals = planTotals([line(100_000, 10_000, 40_000), line(50_000, 0, 0)]);
    expect(totals.todayPerDay).toBe(150_000);
    expect(totals.afterQuickWinsPerDay).toBe(160_000);
    expect(totals.afterRebuildPerDay).toBe(200_000);
    expect(totals.unknownColonies).toBe(0);
  });

  it('leaves an unknown colony out and counts it, so a partial sum is never presented as whole', () => {
    const totals = planTotals([line(100_000, 0, 0), line(null, 0, 0)]);
    expect(totals.todayPerDay).toBe(100_000);
    expect(totals.unknownColonies).toBe(1);
  });

  it('has no total at all when no colony is known', () => {
    const totals = planTotals([line(null, 0, 0)]);
    expect(totals.todayPerDay).toBeNull();
    expect(totals.afterRebuildPerDay).toBeNull();
  });
});

describe('slotNudge', () => {
  it('counts the planets the pilot could still add and what each would earn', () => {
    expect(
      slotNudge({
        used: 2,
        allowed: 6,
        maxSlots: 6,
        assumed: false,
        bestOnePlanetGainPerDay: 150_000,
      })
    ).toEqual({
      used: 2,
      allowed: 6,
      free: 4,
      assumed: false,
      canTrainMore: false,
      gainPerPlanetPerDay: 150_000,
    });
  });

  it('has nothing free at the cap, and offers training when the cap is below the maximum', () => {
    const nudge = slotNudge({
      used: 4,
      allowed: 4,
      maxSlots: 6,
      assumed: false,
      bestOnePlanetGainPerDay: 1,
    });
    expect(nudge.free).toBe(0);
    expect(nudge.canTrainMore).toBe(true);
  });

  it('never reports a negative free count for a pilot over their cap', () => {
    expect(
      slotNudge({ used: 5, allowed: 3, maxSlots: 6, assumed: false, bestOnePlanetGainPerDay: 1 })
        .free
    ).toBe(0);
  });

  it('carries the assumption when the skill never loaded, and an unknown gain as null', () => {
    const nudge = slotNudge({
      used: 1,
      allowed: 1,
      maxSlots: 6,
      assumed: true,
      bestOnePlanetGainPerDay: null,
    });
    expect(nudge.assumed).toBe(true);
    expect(nudge.gainPerPlanetPerDay).toBeNull();
  });
});
