/**
 * The corp ops board's ranking: five heterogeneous clocks in, one ordered list
 * out.
 *
 * A corp manager does not browse, they triage — and everything that matters to
 * them is a clock. Fuel running out, a structure coming out of a reinforcement
 * timer, a moon chunk arriving before it decays, a job sitting undelivered.
 * Those live in four ESI endpoints and, in the game client, four separate
 * windows. Merging them into one deadline-ordered list *is* the feature; the
 * tables underneath it are ordinary (issue #296).
 *
 * Pure by construction (CLAUDE.md): plain numbers and strings in, plain objects
 * out. `nowMs` is a parameter rather than a `Date.now()` call so every ordering
 * and every severity below is deterministic under test. Callers adapt the ESI
 * shapes at the boundary (`features/corp/boardSources.ts`), which is also where
 * names get resolved — the engine ranks, it does not look anything up.
 */

/**
 * The kinds of clock the board merges, in the order that breaks a deadline tie.
 *
 * The order is a judgement about what a manager should read first when two
 * things fall due at the same instant: a structure's own survival, then its
 * fuel, then the moon op it exists to run, then jobs, then standing faults with
 * no clock at all.
 */
export const CORP_BOARD_ITEM_KINDS = [
  'structureTimer',
  'structureFuel',
  'moonExtraction',
  'jobDelivery',
  'serviceOffline',
] as const;

export type CorpBoardItemKind = (typeof CORP_BOARD_ITEM_KINDS)[number];

/**
 * How urgent an item is. Derived from time remaining and nothing else — see
 * `severityForRemaining`.
 */
export type CorpBoardSeverity = 'critical' | 'warning' | 'watch' | 'clear';

/**
 * What kind of clock an item has, which is also what its sort position means:
 *
 * - `timed` — a real instant, still ahead or already behind.
 * - `passed` — it has already happened and ESI no longer says when. Only
 *   `fuel_expires` does this: the field is dropped once a structure runs dry,
 *   which is precisely when it matters. These sort above every timed item.
 * - `untimed` — no clock exists. An offline service is a standing fault, not a
 *   countdown. These sort below every timed item.
 */
export type CorpBoardTiming = 'timed' | 'passed' | 'untimed';

export interface CorpBoardItem {
  /** Unique within a board: React key, and the last tie-break. */
  id: string;
  kind: CorpBoardItemKind;
  /** What the clock is about, already named by the caller (a structure, a product). */
  subject: string;
  /**
   * A second ESI-sourced fact the row needs — the structure's `state`, the
   * offline service's name, `arrival` or `decay` for a moon chunk. Empty when
   * the kind needs none. Never a translated string: this is data, and the view
   * owns the wording.
   */
  detail: string;
  /** Epoch ms the clock runs out. `null` unless `timing` is `timed`. */
  deadlineMs: number | null;
  /**
   * `deadlineMs - nowMs`, deliberately **unclamped**: an overdue item's
   * distance past its deadline is what orders it against the other overdue
   * items, and clamping at zero (as a display countdown does) would collapse
   * every one of them into a single tie. Clamp at the point of display, not
   * here. `null` unless `timing` is `timed`.
   */
  remainingMs: number | null;
  timing: CorpBoardTiming;
  severity: CorpBoardSeverity;
  /**
   * The item's own market-relevant item, or `null` when it has none.
   *
   * Only a job carries one — its product (or, lacking that, its blueprint) —
   * which is what lets the view offer "Check Market"/"Show info" for a job
   * row and neither for a structure or a moon chunk (issue #419's context
   * menu). The board does not resolve a name or render a menu; it only
   * carries the id through from `BoardJobSource`.
   */
  typeId: number | null;
  /**
   * This item's countdown is shorter than the window its data is cached for,
   * so the board cannot honestly present it as live.
   *
   * CCP caches corp structures for roughly an hour, so a snapshot may be an
   * hour old by the time it is read. A multi-day clock survives that; a
   * twelve-minute shield timer does not — it may already have run out. The view
   * must not render these as a ticking countdown. That class of alert belongs
   * to the notification feed, which refreshes on a ten-minute cadence.
   *
   * A deadline already behind us is exempt: time only moves forward, so no
   * amount of cache age can put a past instant back into the future.
   */
  withinStaleWindow: boolean;
}

/** A structure, as the board reads it. Names come resolved — see the module note. */
export interface BoardStructureSource {
  structureId: number;
  name: string;
  /**
   * Epoch ms, or `null` for a structure that has already run dry. ESI *drops*
   * `fuel_expires` at that point rather than dating it, so `null` here means
   * "past due, instant unknown" — never "this structure has no fuel clock".
   */
  fuelExpiresMs: number | null;
  /** ESI's raw `state` string, passed through for the view to name. */
  state: string | null;
  /** Epoch ms the current state's timer ends, or `null` when no timer runs. */
  stateTimerEndMs: number | null;
  /** Epoch ms the structure finishes unanchoring, or `null`. */
  unanchorsAtMs: number | null;
  services: readonly BoardStructureService[];
}

export interface BoardStructureService {
  name: string;
  state: 'online' | 'offline' | 'cleanup';
}

export interface BoardExtractionSource {
  structureId: number;
  /** The refinery the drill is on, already named. */
  subject: string;
  /** Epoch ms the chunk is ready to fracture. */
  chunkArrivalMs: number;
  /** Epoch ms an unfractured chunk breaks up on its own and the ore is lost. */
  naturalDecayMs: number;
}

export interface BoardJobSource {
  jobId: number;
  /** What the job makes, already named. */
  subject: string;
  /** Epoch ms the job finished (or will). */
  endMs: number;
  status: 'active' | 'cancelled' | 'delivered' | 'paused' | 'ready' | 'reverted';
  /** The job's product, or its blueprint lacking one; `null` when neither resolved. */
  typeId: number | null;
}

export interface CorpBoardSources {
  /** The instant the board is rendered for. A parameter, never `Date.now()`. */
  nowMs: number;
  /**
   * How long this data may have been cached — ESI's own `Expires` on the corp
   * endpoints, about an hour. Sizes `withinStaleWindow`.
   */
  staleWindowMs: number;
  /**
   * Each source is optional and absent means *not readable*, not empty: a
   * Station Manager who is not an Accountant simply passes no jobs, and the
   * board says nothing about jobs rather than claiming there are none.
   */
  structures?: readonly BoardStructureSource[];
  extractions?: readonly BoardExtractionSource[];
  jobs?: readonly BoardJobSource[];
}

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/**
 * The one severity ladder, applied to every kind of item alike.
 *
 * This function existing at all is the point: a Fortizar with 25 days of fuel
 * and an Athanor with 2 are the same kind of item at very different urgencies,
 * so urgency cannot be a property of the endpoint an item came from. Nothing
 * here may branch on `CorpBoardItemKind`.
 *
 * `null` — an item with no clock — takes the middle tone. It cannot derive a
 * level, and neither extreme is honest: an offline service is a real fault, but
 * a standing one, and ranking it above a structure that runs dry tonight would
 * invert the ordering the board exists to provide.
 */
export function severityForRemaining(remainingMs: number | null): CorpBoardSeverity {
  if (remainingMs === null) return 'warning';
  if (remainingMs <= 24 * HOUR_MS) return 'critical';
  if (remainingMs <= 3 * DAY_MS) return 'warning';
  if (remainingMs <= 7 * DAY_MS) return 'watch';
  return 'clear';
}

/** The per-source half of an item; the two builders below add every derived field. */
type ItemBase = Pick<CorpBoardItem, 'id' | 'kind' | 'subject' | 'detail' | 'typeId'>;

/** Shared shape-building, so no source can invent its own severity or staleness rule. */
function timedItem(
  base: ItemBase,
  deadlineMs: number,
  { nowMs, staleWindowMs }: Pick<CorpBoardSources, 'nowMs' | 'staleWindowMs'>
): CorpBoardItem {
  const remainingMs = deadlineMs - nowMs;
  return {
    ...base,
    deadlineMs,
    remainingMs,
    timing: 'timed',
    severity: severityForRemaining(remainingMs),
    // Strictly ahead of us and inside the window: an elapsed deadline is
    // certain however stale the read, so only a live countdown can be doubted.
    withinStaleWindow: remainingMs > 0 && remainingMs < staleWindowMs,
  };
}

function clocklessItem(base: ItemBase, timing: 'passed' | 'untimed'): CorpBoardItem {
  return {
    ...base,
    deadlineMs: null,
    remainingMs: null,
    timing,
    // `passed` is critical on its own terms: it is not a countdown that ran
    // low, it is an event that already happened.
    severity: timing === 'passed' ? 'critical' : severityForRemaining(null),
    withinStaleWindow: false,
  };
}

function structureItems(
  structure: BoardStructureSource,
  clock: Pick<CorpBoardSources, 'nowMs' | 'staleWindowMs'>
): CorpBoardItem[] {
  const items: CorpBoardItem[] = [];
  const { structureId, name } = structure;

  const fuel: ItemBase = {
    id: `fuel:${structureId}`,
    kind: 'structureFuel',
    subject: name,
    detail: '',
    typeId: null,
  };
  items.push(
    structure.fuelExpiresMs === null
      ? clocklessItem(fuel, 'passed')
      : timedItem(fuel, structure.fuelExpiresMs, clock)
  );

  // ESI sets `state_timer_end` only while a timer is actually running, so its
  // presence — not the state string — is what decides whether there is a clock.
  if (structure.stateTimerEndMs !== null) {
    items.push(
      timedItem(
        {
          id: `state:${structureId}`,
          kind: 'structureTimer',
          subject: name,
          detail: structure.state ?? 'unknown',
          typeId: null,
        },
        structure.stateTimerEndMs,
        clock
      )
    );
  }

  // A separate item, not a replacement: a structure can be reinforced *and*
  // unanchoring, and they are two different things to act on. Distinct id
  // prefixes keep both usable as React keys.
  if (structure.unanchorsAtMs !== null) {
    items.push(
      timedItem(
        {
          id: `unanchor:${structureId}`,
          kind: 'structureTimer',
          subject: name,
          detail: 'unanchoring',
          typeId: null,
        },
        structure.unanchorsAtMs,
        clock
      )
    );
  }

  for (const service of structure.services) {
    // `cleanup` is the transient state a service passes through on its way
    // offline. It resolves itself in minutes — long before an hour-stale board
    // could report it usefully — so only a settled `offline` is a fault.
    if (service.state !== 'offline') continue;
    items.push(
      clocklessItem(
        {
          id: `service:${structureId}:${service.name}`,
          kind: 'serviceOffline',
          subject: name,
          detail: service.name,
          typeId: null,
        },
        'untimed'
      )
    );
  }

  return items;
}

function extractionItem(
  extraction: BoardExtractionSource,
  clock: Pick<CorpBoardSources, 'nowMs' | 'staleWindowMs'>
): CorpBoardItem {
  // Two clocks, one after the other. Before arrival the deadline is the op
  // itself; after it, the chunk is fracturable and what matters is the moment
  // it breaks up on its own. Keeping the arrival date past arrival would show
  // an op as overdue while there are still days to run it.
  const arrived = clock.nowMs >= extraction.chunkArrivalMs;
  return timedItem(
    {
      id: `moon:${extraction.structureId}`,
      kind: 'moonExtraction',
      subject: extraction.subject,
      detail: arrived ? 'decay' : 'arrival',
      typeId: null,
    },
    arrived ? extraction.naturalDecayMs : extraction.chunkArrivalMs,
    clock
  );
}

function jobItem(
  job: BoardJobSource,
  clock: Pick<CorpBoardSources, 'nowMs' | 'staleWindowMs'>
): CorpBoardItem {
  // Dated from when it finished, so a job that has sat for a month outranks one
  // that finished an hour ago — see `remainingMs` on why that stays unclamped.
  return timedItem(
    {
      id: `job:${job.jobId}`,
      kind: 'jobDelivery',
      subject: job.subject,
      detail: '',
      typeId: job.typeId,
    },
    job.endMs,
    clock
  );
}

/**
 * Where an item sits on the one axis the board sorts by.
 *
 * Collapsing three timing states onto a single number is what lets the
 * comparator stay a plain subtraction: a structure that has already run dry is
 * past every real deadline, and a fault with no clock is beyond every one of
 * them.
 */
function sortKey(item: CorpBoardItem): number {
  if (item.timing === 'passed') return Number.NEGATIVE_INFINITY;
  if (item.timing === 'untimed') return Number.POSITIVE_INFINITY;
  return item.deadlineMs ?? Number.POSITIVE_INFINITY;
}

const KIND_RANK = new Map(CORP_BOARD_ITEM_KINDS.map((kind, index) => [kind, index]));

/**
 * One list, ordered by how soon each clock runs out.
 *
 * Ties are broken explicitly rather than left to `Array.prototype.sort`'s
 * stability: equal deadlines would otherwise inherit whatever order this
 * function happened to concatenate its sources in, which is an accident of the
 * implementation rather than a decision anyone made. Kind first, then id — so
 * the board is a function of its inputs and not of their arrival order.
 */
export function buildCorpBoard(sources: CorpBoardSources): CorpBoardItem[] {
  const clock = { nowMs: sources.nowMs, staleWindowMs: sources.staleWindowMs };
  const items: CorpBoardItem[] = [];

  for (const structure of sources.structures ?? []) items.push(...structureItems(structure, clock));
  for (const extraction of sources.extractions ?? []) items.push(extractionItem(extraction, clock));
  for (const job of sources.jobs ?? []) {
    // `ready` is the only status with anything to do: the job is finished and
    // the output is sitting in the facility waiting for someone to deliver it.
    // Running jobs are not late, and delivered/cancelled ones are done with.
    if (job.status !== 'ready') continue;
    items.push(jobItem(job, clock));
  }

  return items.sort((a, b) => {
    const byDeadline = sortKey(a) - sortKey(b);
    // NaN guard: Infinity - Infinity is NaN, and two untimed items are a tie.
    if (byDeadline !== 0 && !Number.isNaN(byDeadline)) return byDeadline;
    const byKind = (KIND_RANK.get(a.kind) ?? 0) - (KIND_RANK.get(b.kind) ?? 0);
    if (byKind !== 0) return byKind;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
