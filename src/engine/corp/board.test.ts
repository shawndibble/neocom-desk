import { DAY_MS, HOUR_MS, MINUTE_MS } from '@/lib/age';
import { describe, it, expect } from 'vitest';
import {
  CORP_BOARD_ITEM_KINDS,
  buildCorpBoard,
  mergeCorpBoards,
  severityForRemaining,
  type BoardExtractionSource,
  type BoardJobSource,
  type BoardHubFuelSource,
  type BoardSovereigntySource,
  type BoardStarbaseSource,
  type BoardStructureSource,
  type CorpBoardItem,
} from './board';

const NOW = Date.parse('2026-09-03T12:00:00Z');

const STALE_WINDOW = HOUR_MS;

const at = (ms: number) => NOW + ms;

function structure(overrides: Partial<BoardStructureSource> = {}): BoardStructureSource {
  return {
    structureId: 1000000000001,
    name: 'Nakugard - Home',
    fuelExpiresMs: at(30 * DAY_MS),
    state: null,
    stateTimerEndMs: null,
    unanchorsAtMs: null,
    services: [],
    ...overrides,
  };
}

function board(sources: Parameters<typeof buildCorpBoard>[0]): CorpBoardItem[] {
  return buildCorpBoard(sources);
}

function fuelBoard(structures: readonly BoardStructureSource[]): CorpBoardItem[] {
  return board({ nowMs: NOW, staleWindowMs: STALE_WINDOW, structures });
}

describe('severityForRemaining', () => {
  it('derives urgency from time alone, identically for every source', () => {
    expect(severityForRemaining(25 * DAY_MS, 'logistics')).toBe('clear');
    expect(severityForRemaining(2 * DAY_MS, 'logistics')).toBe('warning');
  });

  it('climbs the ladder as the clock runs down', () => {
    expect(severityForRemaining(30 * DAY_MS, 'logistics')).toBe('clear');
    expect(severityForRemaining(5 * DAY_MS, 'logistics')).toBe('watch');
    expect(severityForRemaining(2 * DAY_MS, 'logistics')).toBe('warning');
    expect(severityForRemaining(6 * HOUR_MS, 'logistics')).toBe('critical');
  });

  it('treats an elapsed clock as critical, however far past it is', () => {
    expect(severityForRemaining(0)).toBe('critical');
    expect(severityForRemaining(-1)).toBe('critical');
    expect(severityForRemaining(-90 * DAY_MS)).toBe('critical');
  });

  it('gives an item with no clock the middle tone rather than none or the top', () => {
    expect(severityForRemaining(null)).toBe('warning');
  });
});

describe('structure fuel', () => {
  it('ranks a structure by when its fuel runs out', () => {
    const [item] = fuelBoard([structure({ fuelExpiresMs: at(2 * DAY_MS) })]);
    expect(item.kind).toBe('structureFuel');
    expect(item.subject).toBe('Nakugard - Home');
    expect(item.deadlineMs).toBe(at(2 * DAY_MS));
    expect(item.remainingMs).toBe(2 * DAY_MS);
    expect(item.timing).toBe('timed');
    expect(item.severity).toBe('warning');
  });

  it('reads an absent fuel_expires as already dry, not as untimed', () => {
    const [item] = fuelBoard([structure({ fuelExpiresMs: null })]);
    expect(item.timing).toBe('passed');
    expect(item.severity).toBe('critical');
    expect(item.deadlineMs).toBeNull();
  });

  it('puts a dry structure above every structure that still has fuel', () => {
    const items = fuelBoard([
      structure({ structureId: 2, name: 'Fuelled', fuelExpiresMs: at(MINUTE_MS) }),
      structure({ structureId: 1, name: 'Dry', fuelExpiresMs: null }),
    ]);
    expect(items.map((item) => item.subject)).toEqual(['Dry', 'Fuelled']);
  });
});

describe('structure state timers', () => {
  it('raises an item for a structure sitting in a reinforcement timer', () => {
    const items = fuelBoard([
      structure({ state: 'armor_reinforce', stateTimerEndMs: at(20 * HOUR_MS) }),
    ]);
    const timer = items.find((item) => item.kind === 'structureTimer');
    expect(timer).toBeDefined();
    expect(timer?.deadlineMs).toBe(at(20 * HOUR_MS));
    expect(timer?.detail).toBe('armor_reinforce');
    expect(timer?.severity).toBe('critical');
  });

  it('raises a separate item for an unanchoring structure', () => {
    const items = fuelBoard([structure({ unanchorsAtMs: at(6 * DAY_MS) })]);
    const unanchor = items.filter((item) => item.kind === 'structureTimer');
    expect(unanchor).toHaveLength(1);
    expect(unanchor[0].detail).toBe('unanchoring');
    expect(unanchor[0].deadlineMs).toBe(at(6 * DAY_MS));
  });

  it('raises both when a structure is unanchoring and reinforced at once', () => {
    const items = fuelBoard([
      structure({
        state: 'hull_reinforce',
        stateTimerEndMs: at(2 * HOUR_MS),
        unanchorsAtMs: at(7 * DAY_MS),
      }),
    ]);
    expect(items.filter((item) => item.kind === 'structureTimer')).toHaveLength(2);
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
  });

  it('raises nothing for a structure in a state with no timer running', () => {
    const items = fuelBoard([structure({ state: 'shield_vulnerable', stateTimerEndMs: null })]);
    expect(items.every((item) => item.kind !== 'structureTimer')).toBe(true);
  });
});

describe('offline services', () => {
  it('raises an untimed item for each offline service', () => {
    const items = fuelBoard([
      structure({
        services: [
          { name: 'Clone Bay', state: 'offline' },
          { name: 'Market Hub', state: 'online' },
        ],
      }),
    ]);
    const offline = items.filter((item) => item.kind === 'serviceOffline');
    expect(offline).toHaveLength(1);
    expect(offline[0].detail).toBe('Clone Bay');
    expect(offline[0].timing).toBe('untimed');
    expect(offline[0].deadlineMs).toBeNull();
    expect(offline[0].remainingMs).toBeNull();
  });

  it('ignores a service in the transient cleanup state', () => {
    const items = fuelBoard([
      structure({ services: [{ name: 'Reprocessing', state: 'cleanup' }] }),
    ]);
    expect(items.every((item) => item.kind !== 'serviceOffline')).toBe(true);
  });

  it('sorts untimed items after every timed one, however distant that clock is', () => {
    const items = fuelBoard([
      structure({
        structureId: 1,
        name: 'Home',
        fuelExpiresMs: at(300 * DAY_MS),
        services: [{ name: 'Clone Bay', state: 'offline' }],
      }),
    ]);
    expect(items.map((item) => item.kind)).toEqual(['structureFuel', 'serviceOffline']);
  });
});

describe('moon extractions', () => {
  const extraction = (overrides: Partial<BoardExtractionSource> = {}): BoardExtractionSource => ({
    structureId: 3000000000001,
    subject: 'M-OEE8 II - Moon 1 - Athanor',
    chunkArrivalMs: at(5 * DAY_MS),
    naturalDecayMs: at(7 * DAY_MS),
    ...overrides,
  });

  it('runs to the chunk arrival while the drill is still pulling', () => {
    const [item] = board({
      nowMs: NOW,
      staleWindowMs: STALE_WINDOW,
      extractions: [extraction()],
    });
    expect(item.kind).toBe('moonExtraction');
    expect(item.deadlineMs).toBe(at(5 * DAY_MS));
    expect(item.detail).toBe('arrival');
  });

  it('switches to natural decay once the chunk has arrived', () => {
    const [item] = board({
      nowMs: NOW,
      staleWindowMs: STALE_WINDOW,
      extractions: [
        extraction({ chunkArrivalMs: at(-1 * DAY_MS), naturalDecayMs: at(2 * DAY_MS) }),
      ],
    });
    expect(item.deadlineMs).toBe(at(2 * DAY_MS));
    expect(item.detail).toBe('decay');
    expect(item.severity).toBe('warning');
  });

  it('drops a chunk past its natural decay: history, not a deadline', () => {
    const items = board({
      nowMs: NOW,
      staleWindowMs: STALE_WINDOW,
      extractions: [
        extraction({ chunkArrivalMs: at(-9 * DAY_MS), naturalDecayMs: at(-2 * DAY_MS) }),
      ],
    });
    expect(items).toEqual([]);
  });
});

describe('industry jobs', () => {
  const job = (overrides: Partial<BoardJobSource> = {}): BoardJobSource => ({
    jobId: 500,
    subject: 'Hobgoblin II',
    endMs: at(-3 * DAY_MS),
    status: 'ready',
    typeId: null,
    ...overrides,
  });

  it('raises a job sitting undelivered, dated from when it finished', () => {
    const [item] = board({ nowMs: NOW, staleWindowMs: STALE_WINDOW, jobs: [job()] });
    expect(item.kind).toBe('jobDelivery');
    expect(item.subject).toBe('Hobgoblin II');
    expect(item.deadlineMs).toBe(at(-3 * DAY_MS));
    expect(item.severity).toBe('critical');
  });

  it('carries the job source’s type id through, and null for every other kind', () => {
    const [jobItem] = board({
      nowMs: NOW,
      staleWindowMs: STALE_WINDOW,
      jobs: [job({ typeId: 1001 })],
    });
    expect(jobItem.typeId).toBe(1001);

    const [structureItem] = board({
      nowMs: NOW,
      staleWindowMs: STALE_WINDOW,
      structures: [structure({ fuelExpiresMs: at(2 * DAY_MS) })],
    });
    expect(structureItem.typeId).toBeNull();
  });

  it('ignores jobs that are still running or already dealt with', () => {
    const items = board({
      nowMs: NOW,
      staleWindowMs: STALE_WINDOW,
      jobs: [
        job({ jobId: 1, status: 'active', endMs: at(HOUR_MS) }),
        job({ jobId: 2, status: 'delivered' }),
        job({ jobId: 3, status: 'cancelled' }),
        job({ jobId: 4, status: 'paused' }),
        job({ jobId: 5, status: 'reverted' }),
      ],
    });
    expect(items).toEqual([]);
  });

  it('raises an active job whose end time has already passed', () => {
    const [item] = board({
      nowMs: NOW,
      staleWindowMs: STALE_WINDOW,
      jobs: [job({ status: 'active', endMs: at(-HOUR_MS) })],
    });
    expect(item.kind).toBe('jobDelivery');
    expect(item.deadlineMs).toBe(at(-HOUR_MS));
  });

  it('still ignores a delivered/cancelled/paused/reverted job even once its end time has passed', () => {
    const items = board({
      nowMs: NOW,
      staleWindowMs: STALE_WINDOW,
      jobs: [
        job({ jobId: 2, status: 'delivered', endMs: at(-HOUR_MS) }),
        job({ jobId: 3, status: 'cancelled', endMs: at(-HOUR_MS) }),
        job({ jobId: 4, status: 'paused', endMs: at(-HOUR_MS) }),
        job({ jobId: 5, status: 'reverted', endMs: at(-HOUR_MS) }),
      ],
    });
    expect(items).toEqual([]);
  });

  it('orders overdue jobs by how long they have been sitting', () => {
    const items = board({
      nowMs: NOW,
      staleWindowMs: STALE_WINDOW,
      jobs: [
        job({ jobId: 1, subject: 'Recent', endMs: at(-1 * HOUR_MS) }),
        job({ jobId: 2, subject: 'Ancient', endMs: at(-40 * DAY_MS) }),
        job({ jobId: 3, subject: 'Middling', endMs: at(-2 * DAY_MS) }),
      ],
    });
    expect(items.map((item) => item.subject)).toEqual(['Ancient', 'Middling', 'Recent']);
    expect(items[0].remainingMs).toBe(-40 * DAY_MS);
  });
});

describe('the interleaved board', () => {
  it('interleaves all five item kinds by deadline, ignoring which endpoint they came from', () => {
    const items = board({
      nowMs: NOW,
      staleWindowMs: STALE_WINDOW,
      structures: [
        structure({
          structureId: 1,
          name: 'Athanor',
          fuelExpiresMs: at(4 * DAY_MS),
          state: 'armor_reinforce',
          stateTimerEndMs: at(10 * HOUR_MS),
          services: [{ name: 'Reprocessing', state: 'offline' }],
        }),
      ],
      extractions: [
        {
          structureId: 1,
          subject: 'Athanor',
          chunkArrivalMs: at(2 * DAY_MS),
          naturalDecayMs: at(4 * DAY_MS),
        },
      ],
      jobs: [
        {
          jobId: 9,
          subject: 'Nanite Repair Paste',
          endMs: at(-6 * HOUR_MS),
          status: 'ready',
          typeId: null,
        },
      ],
    });

    expect(items.map((item) => item.kind)).toEqual([
      'jobDelivery',
      'structureTimer',
      'moonExtraction',
      'structureFuel',
      'serviceOffline',
    ]);
  });

  it('breaks ties on kind order and then id, not on the order sources were passed', () => {
    const sameInstant = at(3 * DAY_MS);
    const items = board({
      nowMs: NOW,
      staleWindowMs: STALE_WINDOW,
      jobs: [
        { jobId: 20, subject: 'Second job', endMs: sameInstant, status: 'ready', typeId: null },
        { jobId: 10, subject: 'First job', endMs: sameInstant, status: 'ready', typeId: null },
      ],
      structures: [structure({ structureId: 7, name: 'Tied', fuelExpiresMs: sameInstant })],
    });
    expect(items.map((item) => item.kind)).toEqual(['structureFuel', 'jobDelivery', 'jobDelivery']);
    expect(items.map((item) => item.subject)).toEqual(['Tied', 'First job', 'Second job']);
  });

  it('gives the same board whichever order the sources arrive in', () => {
    const structures = [
      structure({ structureId: 1, name: 'A', fuelExpiresMs: at(DAY_MS) }),
      structure({ structureId: 2, name: 'B', fuelExpiresMs: at(DAY_MS) }),
    ];
    const forwards = board({ nowMs: NOW, staleWindowMs: STALE_WINDOW, structures });
    const backwards = board({
      nowMs: NOW,
      staleWindowMs: STALE_WINDOW,
      structures: [...structures].reverse(),
    });
    expect(forwards.map((item) => item.id)).toEqual(backwards.map((item) => item.id));
  });

  it('returns an empty board rather than throwing when nothing was readable', () => {
    expect(board({ nowMs: NOW, staleWindowMs: STALE_WINDOW })).toEqual([]);
  });

  it('does not mutate the sources it was handed', () => {
    const structures = [structure({ structureId: 1, fuelExpiresMs: at(DAY_MS) })];
    const snapshot = JSON.parse(JSON.stringify(structures)) as unknown;
    board({ nowMs: NOW, staleWindowMs: STALE_WINDOW, structures });
    expect(structures).toEqual(snapshot);
  });
});

describe('short timers against an hour-stale cache', () => {
  it('marks a clock shorter than the cache window as untrustworthy', () => {
    const timer = fuelBoard([
      structure({ state: 'shield_vulnerable', stateTimerEndMs: at(12 * MINUTE_MS) }),
    ]).find((entry) => entry.kind === 'structureTimer');
    expect(timer?.withinStaleWindow).toBe(true);
  });

  it('leaves a multi-day clock alone — hour-stale is honest at that window', () => {
    const [item] = fuelBoard([structure({ fuelExpiresMs: at(3 * DAY_MS) })]);
    expect(item.withinStaleWindow).toBe(false);
  });

  it('does not doubt a deadline that has already passed', () => {
    const items = board({
      nowMs: NOW,
      staleWindowMs: STALE_WINDOW,
      jobs: [
        { jobId: 1, subject: 'Done', endMs: at(-5 * MINUTE_MS), status: 'ready', typeId: null },
      ],
    });
    expect(items[0].withinStaleWindow).toBe(false);
  });

  it('never doubts an item that has no clock at all', () => {
    const items = fuelBoard([
      structure({ fuelExpiresMs: null, services: [{ name: 'Clone Bay', state: 'offline' }] }),
    ]);
    for (const item of items) expect(item.withinStaleWindow).toBe(false);
  });
});

describe('CORP_BOARD_ITEM_KINDS', () => {
  it('is the tie-break order, and covers every kind the board can produce', () => {
    const items = board({
      nowMs: NOW,
      staleWindowMs: STALE_WINDOW,
      structures: [
        structure({
          fuelExpiresMs: at(DAY_MS),
          state: 'armor_reinforce',
          stateTimerEndMs: at(DAY_MS),
          services: [{ name: 'Clone Bay', state: 'offline' }],
        }),
      ],
      extractions: [
        {
          structureId: 1,
          subject: 'Athanor',
          chunkArrivalMs: at(DAY_MS),
          naturalDecayMs: at(2 * DAY_MS),
        },
      ],
      jobs: [{ jobId: 1, subject: 'Job', endMs: at(DAY_MS), status: 'ready', typeId: null }],
      sovereignty: [
        {
          id: 'skyhook:1',
          name: 'Skyhook',
          kind: 'skyhook',
          startMs: at(DAY_MS),
          endMs: at(2 * DAY_MS),
        },
      ],
      hubFuel: [{ id: 'hub:9', name: 'Efa', runsOutMs: at(DAY_MS) }],
    });
    const produced = new Set(items.map((item) => item.kind));
    expect([...produced].sort()).toEqual([...CORP_BOARD_ITEM_KINDS].sort());
  });
});

describe('starbases', () => {
  const starbase = (over: Partial<BoardStarbaseSource> = {}): BoardStarbaseSource => ({
    starbaseId: 7,
    name: 'Efa - Moon 1',
    fuelExpiresMs: null,
    reinforcedUntilMs: null,
    unanchorsAtMs: null,
    ...over,
  });

  const sbBoard = (starbases: BoardStarbaseSource[]) =>
    board({ nowMs: NOW, staleWindowMs: STALE_WINDOW, starbases });

  it('puts nothing on the board for a tower with no known fuel clock or timer', () => {
    expect(sbBoard([starbase()])).toEqual([]);
  });

  it('ranks a fuel clock as structure fuel, like any other deadline', () => {
    const [item] = sbBoard([starbase({ fuelExpiresMs: at(5 * HOUR_MS) })]);
    expect(item).toMatchObject({
      kind: 'structureFuel',
      subject: 'Efa - Moon 1',
      deadlineMs: at(5 * HOUR_MS),
      timing: 'timed',
    });
  });

  it('shows an empty bay as an overdue clock, not an unknown one', () => {
    const [item] = sbBoard([starbase({ fuelExpiresMs: at(-2 * HOUR_MS) })]);
    expect(item!.severity).toBe('critical');
    expect(item!.remainingMs).toBe(-2 * HOUR_MS);
  });

  it('adds reinforcement and unanchor timers as structure timers', () => {
    const items = sbBoard([
      starbase({ reinforcedUntilMs: at(3 * DAY_MS), unanchorsAtMs: at(4 * DAY_MS) }),
    ]);
    expect(items.map((i) => [i.kind, i.detail])).toEqual([
      ['structureTimer', 'reinforced'],
      ['structureTimer', 'unanchoring'],
    ]);
  });

  it('does not tick a reinforcement shorter than the cache window', () => {
    const [item] = sbBoard([starbase({ reinforcedUntilMs: at(20 * MINUTE_MS) })]);
    expect(item!.withinStaleWindow).toBe(true);
  });
});

describe('sovereignty raid windows', () => {
  const raid = (over: Partial<BoardSovereigntySource> = {}): BoardSovereigntySource => ({
    id: 'skyhook:5',
    name: 'Skyhook (X-7OMU)',
    kind: 'skyhook',
    startMs: at(6 * HOUR_MS),
    endMs: at(8 * HOUR_MS),
    ...over,
  });

  const sovBoard = (sovereignty: BoardSovereigntySource[]) =>
    board({ nowMs: NOW, staleWindowMs: STALE_WINDOW, sovereignty });

  it('ranks a window that has not opened by when it opens', () => {
    const [item] = sovBoard([raid()]);
    expect(item).toMatchObject({
      kind: 'sovRaid',
      subject: 'Skyhook (X-7OMU)',
      detail: 'skyhook.upcoming',
      deadlineMs: at(6 * HOUR_MS),
      timing: 'timed',
    });
  });

  it('ranks an open window by when it closes', () => {
    const [item] = sovBoard([raid({ startMs: at(-HOUR_MS), endMs: at(2 * HOUR_MS) })]);
    expect(item).toMatchObject({ detail: 'skyhook.open', deadlineMs: at(2 * HOUR_MS) });
  });

  it('drops a window that already closed', () => {
    expect(sovBoard([raid({ startMs: at(-3 * HOUR_MS), endMs: at(-HOUR_MS) })])).toEqual([]);
  });

  it('keeps a hub past its window end as overtime, still vulnerable', () => {
    const items = sovBoard([
      raid({ id: 'hub:9', kind: 'hub', startMs: at(-3 * HOUR_MS), endMs: at(-HOUR_MS) }),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ detail: 'hub.overtime', timing: 'timed' });
    expect(items[0]!.severity).toBe('critical');
  });

  it('takes severity from the time remaining until the ranked end of the window', () => {
    const [far] = sovBoard([raid({ startMs: at(3 * DAY_MS), endMs: at(3 * DAY_MS + HOUR_MS) })]);
    const [soon] = sovBoard([raid({ startMs: at(HOUR_MS), endMs: at(2 * HOUR_MS) })]);
    const [open] = sovBoard([raid({ startMs: at(-HOUR_MS), endMs: at(20 * MINUTE_MS) })]);
    expect(far!.severity).toBe(severityForRemaining(3 * DAY_MS, 'logistics'));
    expect(soon!.severity).toBe(severityForRemaining(HOUR_MS, 'logistics'));
    expect(open!.severity).toBe(severityForRemaining(20 * MINUTE_MS, 'logistics'));
    expect(open!.severity).not.toBe(far!.severity);
  });

  it('names a hub window as a hub', () => {
    const [item] = sovBoard([raid({ id: 'hub:9', kind: 'hub' })]);
    expect(item!.detail).toBe('hub.upcoming');
  });
});

describe('sov hub reagents', () => {
  const hubBoard = (hubFuel: BoardHubFuelSource[]) =>
    board({ nowMs: NOW, staleWindowMs: STALE_WINDOW, hubFuel });

  it('is a fuel clock that runs out when the bay empties', () => {
    const [item] = hubBoard([{ id: 'hub:9', name: 'Efa', runsOutMs: at(26 * HOUR_MS) }]);
    expect(item).toMatchObject({
      id: 'fuel:hub:9',
      kind: 'sovHubFuel',
      subject: 'Efa',
      deadlineMs: at(26 * HOUR_MS),
      timing: 'timed',
    });
  });

  it('stays on the board once the bay is empty, overdue', () => {
    const [item] = hubBoard([{ id: 'hub:9', name: 'Efa', runsOutMs: at(-HOUR_MS) }]);
    expect(item!.severity).toBe('critical');
  });
});

describe('mergeCorpBoards', () => {
  it("ranks two corporations' deadlines together, each row carrying its corporation", () => {
    const a = fuelBoard([structure({ structureId: 1, fuelExpiresMs: at(5 * DAY_MS) })]);
    const b = fuelBoard([
      structure({ structureId: 1, fuelExpiresMs: at(2 * DAY_MS) }),
      structure({ structureId: 2, fuelExpiresMs: at(9 * DAY_MS) }),
    ]);
    const merged = mergeCorpBoards([
      { corporationId: 500, items: a },
      { corporationId: 600, items: b },
    ]);
    expect(merged.map((item) => [item.corporationId, item.deadlineMs])).toEqual([
      [600, at(2 * DAY_MS)],
      [500, at(5 * DAY_MS)],
      [600, at(9 * DAY_MS)],
    ]);
    expect(new Set(merged.map((item) => item.id)).size).toBe(3);
  });

  it('changes nothing about a row but its corporation and key', () => {
    const items = fuelBoard([structure()]);
    const [merged] = mergeCorpBoards([{ corporationId: 500, items }]);
    expect({ ...merged, id: items[0]!.id }).toEqual({ ...items[0], corporationId: 500 });
  });
});
