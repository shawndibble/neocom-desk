import { describe, it, expect } from 'vitest';
import {
  CORP_BOARD_ITEM_KINDS,
  buildCorpBoard,
  severityForRemaining,
  type BoardExtractionSource,
  type BoardJobSource,
  type BoardStructureSource,
  type CorpBoardItem,
} from './board';

const NOW = Date.parse('2026-09-03T12:00:00Z');
const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

/** The window corp reads are cached for — ESI's own ~1h on the structures endpoint. */
const STALE_WINDOW = HOUR;

const at = (ms: number) => NOW + ms;

function structure(overrides: Partial<BoardStructureSource> = {}): BoardStructureSource {
  return {
    structureId: 1000000000001,
    name: 'Nakugard - Home',
    fuelExpiresMs: at(30 * DAY),
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

/** The common case: only structures, only the fuel clock. */
function fuelBoard(structures: readonly BoardStructureSource[]): CorpBoardItem[] {
  return board({ nowMs: NOW, staleWindowMs: STALE_WINDOW, structures });
}

describe('severityForRemaining', () => {
  /**
   * The heart of AC2: one ladder, called by every source. A Fortizar with 25
   * days of fuel and an Athanor with 2 are the same kind of item at very
   * different urgencies, and nothing about *which endpoint they came from*
   * may enter into it.
   */
  it('derives urgency from time alone, identically for every source', () => {
    expect(severityForRemaining(25 * DAY)).toBe('clear');
    expect(severityForRemaining(2 * DAY)).toBe('warning');
  });

  it('climbs the ladder as the clock runs down', () => {
    expect(severityForRemaining(30 * DAY)).toBe('clear');
    expect(severityForRemaining(5 * DAY)).toBe('watch');
    expect(severityForRemaining(2 * DAY)).toBe('warning');
    expect(severityForRemaining(6 * HOUR)).toBe('critical');
  });

  it('treats an elapsed clock as critical, however far past it is', () => {
    expect(severityForRemaining(0)).toBe('critical');
    expect(severityForRemaining(-1)).toBe('critical');
    expect(severityForRemaining(-90 * DAY)).toBe('critical');
  });

  /**
   * An offline service has no clock to rank by, so it cannot derive a level.
   * It takes the middle tone rather than the top: it is a real fault, but a
   * standing one, and shouting it over a structure that runs dry tonight
   * would invert the board's whole ordering.
   */
  it('gives an item with no clock the middle tone rather than none or the top', () => {
    expect(severityForRemaining(null)).toBe('warning');
  });
});

describe('structure fuel', () => {
  it('ranks a structure by when its fuel runs out', () => {
    const [item] = fuelBoard([structure({ fuelExpiresMs: at(2 * DAY) })]);
    expect(item.kind).toBe('structureFuel');
    expect(item.subject).toBe('Nakugard - Home');
    expect(item.deadlineMs).toBe(at(2 * DAY));
    expect(item.remainingMs).toBe(2 * DAY);
    expect(item.timing).toBe('timed');
    expect(item.severity).toBe('warning');
  });

  /**
   * `fuel_expires` is absent exactly when it matters most: ESI drops the field
   * once the structure has run dry. Reading that as "no timer" would sort a
   * dead Fortizar to the bottom of the board, under a moon chunk three weeks
   * out.
   */
  it('reads an absent fuel_expires as already dry, not as untimed', () => {
    const [item] = fuelBoard([structure({ fuelExpiresMs: null })]);
    expect(item.timing).toBe('passed');
    expect(item.severity).toBe('critical');
    expect(item.deadlineMs).toBeNull();
  });

  it('puts a dry structure above every structure that still has fuel', () => {
    const items = fuelBoard([
      structure({ structureId: 2, name: 'Fuelled', fuelExpiresMs: at(MINUTE) }),
      structure({ structureId: 1, name: 'Dry', fuelExpiresMs: null }),
    ]);
    expect(items.map((item) => item.subject)).toEqual(['Dry', 'Fuelled']);
  });
});

describe('structure state timers', () => {
  it('raises an item for a structure sitting in a reinforcement timer', () => {
    const items = fuelBoard([
      structure({ state: 'armor_reinforce', stateTimerEndMs: at(20 * HOUR) }),
    ]);
    const timer = items.find((item) => item.kind === 'structureTimer');
    expect(timer).toBeDefined();
    expect(timer?.deadlineMs).toBe(at(20 * HOUR));
    expect(timer?.detail).toBe('armor_reinforce');
    expect(timer?.severity).toBe('critical');
  });

  it('raises a separate item for an unanchoring structure', () => {
    const items = fuelBoard([structure({ unanchorsAtMs: at(6 * DAY) })]);
    const unanchor = items.filter((item) => item.kind === 'structureTimer');
    expect(unanchor).toHaveLength(1);
    expect(unanchor[0].detail).toBe('unanchoring');
    expect(unanchor[0].deadlineMs).toBe(at(6 * DAY));
  });

  it('raises both when a structure is unanchoring and reinforced at once', () => {
    const items = fuelBoard([
      structure({
        state: 'hull_reinforce',
        stateTimerEndMs: at(2 * HOUR),
        unanchorsAtMs: at(7 * DAY),
      }),
    ]);
    expect(items.filter((item) => item.kind === 'structureTimer')).toHaveLength(2);
    // Two items about one structure must not collide as React keys.
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

  /**
   * `cleanup` is the transient state a service passes through on its way
   * offline, not a fault someone has to act on — it resolves itself within
   * minutes, long before an hour-stale board could report it usefully.
   */
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
        fuelExpiresMs: at(300 * DAY),
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
    chunkArrivalMs: at(5 * DAY),
    naturalDecayMs: at(7 * DAY),
    ...overrides,
  });

  it('runs to the chunk arrival while the drill is still pulling', () => {
    const [item] = board({
      nowMs: NOW,
      staleWindowMs: STALE_WINDOW,
      extractions: [extraction()],
    });
    expect(item.kind).toBe('moonExtraction');
    expect(item.deadlineMs).toBe(at(5 * DAY));
    expect(item.detail).toBe('arrival');
  });

  /**
   * Past arrival the chunk is fracturable and the clock that matters is the
   * one that ends it: an unfractured chunk breaks up on its own and the ore is
   * gone. Keeping the arrival deadline here would show an op as overdue when
   * there are still two days to run it.
   */
  it('switches to natural decay once the chunk has arrived', () => {
    const [item] = board({
      nowMs: NOW,
      staleWindowMs: STALE_WINDOW,
      extractions: [extraction({ chunkArrivalMs: at(-1 * DAY), naturalDecayMs: at(2 * DAY) })],
    });
    expect(item.deadlineMs).toBe(at(2 * DAY));
    expect(item.detail).toBe('decay');
    expect(item.severity).toBe('warning');
  });

  it('is critical once even the decay time has passed', () => {
    const [item] = board({
      nowMs: NOW,
      staleWindowMs: STALE_WINDOW,
      extractions: [extraction({ chunkArrivalMs: at(-9 * DAY), naturalDecayMs: at(-2 * DAY) })],
    });
    expect(item.severity).toBe('critical');
    expect(item.remainingMs).toBe(-2 * DAY);
  });
});

describe('industry jobs', () => {
  const job = (overrides: Partial<BoardJobSource> = {}): BoardJobSource => ({
    jobId: 500,
    subject: 'Hobgoblin II',
    endMs: at(-3 * DAY),
    status: 'ready',
    ...overrides,
  });

  it('raises a job sitting undelivered, dated from when it finished', () => {
    const [item] = board({ nowMs: NOW, staleWindowMs: STALE_WINDOW, jobs: [job()] });
    expect(item.kind).toBe('jobDelivery');
    expect(item.subject).toBe('Hobgoblin II');
    expect(item.deadlineMs).toBe(at(-3 * DAY));
    expect(item.severity).toBe('critical');
  });

  it('ignores jobs that are still running or already dealt with', () => {
    const items = board({
      nowMs: NOW,
      staleWindowMs: STALE_WINDOW,
      jobs: [
        job({ jobId: 1, status: 'active', endMs: at(HOUR) }),
        job({ jobId: 2, status: 'delivered' }),
        job({ jobId: 3, status: 'cancelled' }),
        job({ jobId: 4, status: 'paused' }),
      ],
    });
    expect(items).toEqual([]);
  });

  /**
   * The longer a job sits, the more overdue it is — so the sort key must not
   * be clamped at zero the way a display countdown is, or every undelivered
   * job in the corp collapses into one tie.
   */
  it('orders overdue jobs by how long they have been sitting', () => {
    const items = board({
      nowMs: NOW,
      staleWindowMs: STALE_WINDOW,
      jobs: [
        job({ jobId: 1, subject: 'Recent', endMs: at(-1 * HOUR) }),
        job({ jobId: 2, subject: 'Ancient', endMs: at(-40 * DAY) }),
        job({ jobId: 3, subject: 'Middling', endMs: at(-2 * DAY) }),
      ],
    });
    expect(items.map((item) => item.subject)).toEqual(['Ancient', 'Middling', 'Recent']);
    expect(items[0].remainingMs).toBe(-40 * DAY);
  });
});

describe('the interleaved board', () => {
  /**
   * AC2: one ordered list mixing every source, which is the whole feature —
   * these five clocks live in four ESI endpoints and four windows in game.
   */
  it('interleaves all five item kinds by deadline, ignoring which endpoint they came from', () => {
    const items = board({
      nowMs: NOW,
      staleWindowMs: STALE_WINDOW,
      structures: [
        structure({
          structureId: 1,
          name: 'Athanor',
          fuelExpiresMs: at(4 * DAY),
          state: 'armor_reinforce',
          stateTimerEndMs: at(10 * HOUR),
          services: [{ name: 'Reprocessing', state: 'offline' }],
        }),
      ],
      extractions: [
        {
          structureId: 1,
          subject: 'Athanor',
          chunkArrivalMs: at(2 * DAY),
          naturalDecayMs: at(4 * DAY),
        },
      ],
      jobs: [{ jobId: 9, subject: 'Nanite Repair Paste', endMs: at(-6 * HOUR), status: 'ready' }],
    });

    expect(items.map((item) => item.kind)).toEqual([
      'jobDelivery', // 6h overdue
      'structureTimer', // 10h
      'moonExtraction', // 2d
      'structureFuel', // 4d
      'serviceOffline', // no clock — last
    ]);
  });

  /**
   * Array.prototype.sort is stable, so equal deadlines would otherwise inherit
   * whatever order the caller happened to concatenate its sources in — an
   * ordering that is an accident of this function's internals rather than a
   * decision. Ties resolve on kind, then on id.
   */
  it('breaks ties on kind order and then id, not on the order sources were passed', () => {
    const sameInstant = at(3 * DAY);
    const items = board({
      nowMs: NOW,
      staleWindowMs: STALE_WINDOW,
      jobs: [
        { jobId: 20, subject: 'Second job', endMs: sameInstant, status: 'ready' },
        { jobId: 10, subject: 'First job', endMs: sameInstant, status: 'ready' },
      ],
      structures: [structure({ structureId: 7, name: 'Tied', fuelExpiresMs: sameInstant })],
    });
    expect(items.map((item) => item.kind)).toEqual(['structureFuel', 'jobDelivery', 'jobDelivery']);
    expect(items.map((item) => item.subject)).toEqual(['Tied', 'First job', 'Second job']);
  });

  it('gives the same board whichever order the sources arrive in', () => {
    const structures = [
      structure({ structureId: 1, name: 'A', fuelExpiresMs: at(DAY) }),
      structure({ structureId: 2, name: 'B', fuelExpiresMs: at(DAY) }),
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
    const structures = [structure({ structureId: 1, fuelExpiresMs: at(DAY) })];
    const snapshot = JSON.parse(JSON.stringify(structures)) as unknown;
    board({ nowMs: NOW, staleWindowMs: STALE_WINDOW, structures });
    expect(structures).toEqual(snapshot);
  });
});

describe('short timers against an hour-stale cache', () => {
  /**
   * The failure mode the ticket names: CCP caches corp structures for about an
   * hour, so a twelve-minute armor timer read from this board may already have
   * run out. Marking it here, in the pure layer, is what lets the view refuse
   * to render it as a live countdown — and what makes that refusal testable
   * rather than a comment in JSX.
   */
  it('marks a clock shorter than the cache window as untrustworthy', () => {
    const timer = fuelBoard([
      structure({ state: 'shield_vulnerable', stateTimerEndMs: at(12 * MINUTE) }),
    ]).find((entry) => entry.kind === 'structureTimer');
    expect(timer?.withinStaleWindow).toBe(true);
  });

  it('leaves a multi-day clock alone — hour-stale is honest at that window', () => {
    const [item] = fuelBoard([structure({ fuelExpiresMs: at(3 * DAY) })]);
    expect(item.withinStaleWindow).toBe(false);
  });

  /**
   * A deadline already behind us is certain: time only moves forward, so no
   * amount of cache age can put it back in the future. The doubt is only ever
   * about a countdown shorter than the window.
   */
  it('does not doubt a deadline that has already passed', () => {
    const items = board({
      nowMs: NOW,
      staleWindowMs: STALE_WINDOW,
      jobs: [{ jobId: 1, subject: 'Done', endMs: at(-5 * MINUTE), status: 'ready' }],
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
          fuelExpiresMs: at(DAY),
          state: 'armor_reinforce',
          stateTimerEndMs: at(DAY),
          services: [{ name: 'Clone Bay', state: 'offline' }],
        }),
      ],
      extractions: [
        {
          structureId: 1,
          subject: 'Athanor',
          chunkArrivalMs: at(DAY),
          naturalDecayMs: at(2 * DAY),
        },
      ],
      jobs: [{ jobId: 1, subject: 'Job', endMs: at(DAY), status: 'ready' }],
    });
    const produced = new Set(items.map((item) => item.kind));
    expect([...produced].sort()).toEqual([...CORP_BOARD_ITEM_KINDS].sort());
  });
});
