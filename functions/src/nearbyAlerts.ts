// Nearby alerts for a closed app (issue #5122, ADR 0027): which Incursions and raidable
// skyhook windows came within a device's N jumps of a Character's location since the
// last poll. Pure: the poller (pollEveNotifications.ts) hands in the location, the two
// public lists, the device's choices and the state it stored last time.
//
// Every rule is the Foreground Poller's, so the open app neither toasts twice nor files
// a second row: the entries are built as `pollDomains/incursions.ts` and
// `pollDomains/skyhooksNearby.ts` build them, diffed by mirrors of the app's own
// `diffIncursionNearby` / `diffSkyhookRaidableNearby`, counted over the same stargate
// graph by a mirror of `engine/route/jumpRoute.ts` under the device's Travel Settings,
// and keyed by the same Occurrence Keys. Wormhole and Ansiblex shortcuts are left out
// (decision 20261025: the server counts gates only).

import { STARGATES, SYSTEM_SECURITY } from './data/stargateGraph.js';
import {
  diffIncursionNearby,
  type IncursionAlertEntry,
  type IncursionAlertSnapshot,
  type IncursionNearbyFire,
} from './incursionAlert.js';
import { INCURSION_STATES } from './incursionState.js';
import {
  DEFAULT_SECURITY_PENALTY,
  jumpDistancesFrom,
  type JumpGraph,
  type RoutePreferenceKind,
} from './jumpRoute.js';
import {
  diffSkyhookRaidableNearby,
  type SkyhookAlertEntry,
  type SkyhookAlertSnapshot,
  type SkyhookRaidableNearbyFire,
} from './skyhookAlert.js';

export const NEARBY_EVENT_IDS = ['incursionNearby', 'skyhookRaidableNearby'] as const;
export type NearbyEventId = (typeof NEARBY_EVENT_IDS)[number];

export function isNearbyEventId(value: string): value is NearbyEventId {
  return (NEARBY_EVENT_IDS as readonly string[]).includes(value);
}

/** What one jump count is asked under: the device's Travel Settings (`features/route/routeRules.ts`). */
export interface NearbyRouteRules {
  preference: RoutePreferenceKind;
  /** 0–100. */
  securityPenalty: number;
  /** Avoided Systems, already resolved by the device (its own list and the pod-kill / EDENCOM / Triglavian rules). */
  avoid: readonly number[];
}

/** The app's defaults (`DEFAULT_ROUTE_PREFERENCE`, the game's penalty), for a device that sent no rules. */
export const DEFAULT_NEARBY_ROUTE_RULES: NearbyRouteRules = {
  preference: 'prefer-highsec',
  securityPenalty: DEFAULT_SECURITY_PENALTY,
  avoid: [],
};

/** One entry of ESI `GET /skyhooks/raidable`; only the fields used. */
export interface RaidableSkyhook {
  solar_system_id: number;
  planet_id: number;
  theft_vulnerability?: { start: string; end: string };
}

/** One entry of ESI `GET /incursions`; only the fields used. */
export interface IncursionListing {
  constellation_id: number;
  staging_solar_system_id: number;
  state: string;
}

/** The two public lists for this run; `null` where one could not be read. */
export interface NearbyLists {
  skyhooks: readonly RaidableSkyhook[] | null;
  incursions: readonly IncursionListing[] | null;
}

/** The frame a snapshot was counted in: the Current System and the pilot's N. */
export interface NearbyFrame {
  originSystemId: number;
  withinJumps: number;
}

/**
 * A stored snapshot, cut down to what the diff reads: the frame (or `null` for a
 * snapshot with no entries, which the app's diff treats as frameless) and the entries
 * that were in range. The out-of-range rest only ever told the diff the frame.
 */
export interface StoredSnapshot<Entry> {
  frame: NearbyFrame | null;
  inRange: Entry[];
}

/** One device's stored state for one Character. */
export interface StoredNearby {
  incursion?: StoredSnapshot<IncursionAlertEntry>;
  skyhook?: StoredSnapshot<SkyhookAlertEntry>;
}

export interface DeviceCharacterNearby {
  characterId: number;
  /** The Character's location this run. */
  originSystemId: number;
  /** The nearby events this device enabled for the browser channel for this Character. */
  events: readonly string[];
  /** This device's N per event for this Character; an event without one is not polled. */
  nearbyJumps: Partial<Record<NearbyEventId, number>>;
}

export type NearbyFire = IncursionNearbyFire | SkyhookRaidableNearbyFire;

export interface KeyedNearbyFire {
  fire: NearbyFire;
  occurrenceKey: string;
}

/** `src/engine/occurrenceKey.ts`'s `skyhookRaidableNearby` case; no Character, the window is the world's. */
export function skyhookRaidableNearbyOccurrenceKey(
  systemId: number,
  planetId: number,
  startMs: number
): string {
  return ['skyhookRaidableNearby', systemId, planetId, startMs].join(':');
}

/** `src/engine/occurrenceKey.ts`'s `incursionNearby` case; no Character, the Incursion is the world's. */
export function incursionNearbyOccurrenceKey(
  constellationId: number,
  stagingSystemId: number
): string {
  return ['incursionNearby', constellationId, stagingSystemId].join(':');
}

export function occurrenceKeyOf(fire: NearbyFire): string {
  return fire.eventId === 'incursionNearby'
    ? incursionNearbyOccurrenceKey(fire.constellationId, fire.stagingSystemId)
    : skyhookRaidableNearbyOccurrenceKey(fire.systemId, fire.planetId, fire.startMs);
}

let graph: JumpGraph | null = null;

function stargateGraph(): JumpGraph {
  graph ??= new Map(Object.entries(STARGATES).map(([id, next]) => [Number(id), next]));
  return graph;
}

const securityOf = (systemId: number): number | undefined => SYSTEM_SECURITY[String(systemId)];

/** Jumps from `originSystemId` to every system it reaches by stargate, under `rules`. */
export function jumpDistancesUnder(
  originSystemId: number,
  rules: NearbyRouteRules
): ReadonlyMap<number, number> {
  return jumpDistancesFrom(stargateGraph(), originSystemId, {
    preference: rules.preference,
    securityPenalty: rules.securityPenalty,
    securityOf,
    avoid: new Set(rules.avoid),
  });
}

function parseInstant(iso: string | undefined): number | null {
  if (iso === undefined) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

const inRange = (entry: { jumps: number | null; withinJumps: number }) =>
  entry.jumps !== null && entry.jumps <= entry.withinJumps;

/** The diff's view of a stored snapshot: in-range entries, or one out-of-range carrier for the frame. */
function restore<Entry extends { jumps: number | null }>(
  stored: StoredSnapshot<Entry> | undefined,
  carrier: (frame: NearbyFrame) => Entry,
  nowMs: number
): { entries: Entry[]; nowMs: number } | undefined {
  if (stored === undefined) return undefined;
  if (stored.frame === null || stored.inRange.length > 0) return { entries: stored.inRange, nowMs };
  return { entries: [carrier(stored.frame)], nowMs };
}

function store<Entry extends NearbyFrame & { jumps: number | null }>(
  entries: readonly Entry[],
  keep: (entry: Entry) => boolean = () => true
): StoredSnapshot<Entry> {
  const first = entries[0];
  return {
    frame:
      first === undefined
        ? null
        : { originSystemId: first.originSystemId, withinJumps: first.withinJumps },
    inRange: entries.filter((entry) => inRange(entry) && keep(entry)),
  };
}

/** The entries `pollDomains/skyhooksNearby.ts` builds: one per readable window. */
function skyhookEntries(
  list: readonly RaidableSkyhook[],
  originSystemId: number,
  withinJumps: number,
  distances: () => ReadonlyMap<number, number>
): SkyhookAlertEntry[] {
  const windows = list.flatMap((hook) => {
    const startMs = parseInstant(hook.theft_vulnerability?.start);
    const endMs = parseInstant(hook.theft_vulnerability?.end);
    return startMs === null || endMs === null
      ? []
      : [{ systemId: hook.solar_system_id, planetId: hook.planet_id, startMs, endMs }];
  });
  if (windows.length === 0) return [];
  const jumps = distances();
  return windows.map((hook) => ({
    ...hook,
    jumps: jumps.get(hook.systemId) ?? null,
    originSystemId,
    withinJumps,
  }));
}

/** The entries `pollDomains/incursions.ts` builds: every Incursion in a known state. */
function incursionEntries(
  list: readonly IncursionListing[],
  originSystemId: number,
  withinJumps: number,
  distances: () => ReadonlyMap<number, number>
): IncursionAlertEntry[] {
  if (list.length === 0) return [];
  const jumps = distances();
  return list.flatMap((entry) =>
    (INCURSION_STATES as readonly string[]).includes(entry.state)
      ? [
          {
            constellationId: entry.constellation_id,
            stagingSystemId: entry.staging_solar_system_id,
            state: entry.state as IncursionAlertEntry['state'],
            jumps: jumps.get(entry.staging_solar_system_id) ?? null,
            originSystemId,
            withinJumps,
          },
        ]
      : []
  );
}

export interface DeviceNearbyInput {
  /** The device's Characters that have a location this run. */
  characters: readonly DeviceCharacterNearby[];
  /** Stored state by Character id (string keys, as Firestore stores them). */
  prev: Readonly<Record<string, StoredNearby>>;
  lists: NearbyLists;
  nowMs: number;
  /** Jumps from an origin under this device's rules; memoised by the caller. */
  distancesFrom: (originSystemId: number) => ReadonlyMap<number, number>;
}

export interface DeviceNearbyResult {
  /** One per occurrence, already reduced to the best Character's copy. */
  fires: KeyedNearbyFire[];
  /** The state to store: every Character in `prev`, updated for those polled. */
  next: Record<string, StoredNearby>;
}

/**
 * Lower sorts first: the nearest, then the lowest id (stable across polls) —
 * `foregroundPoller/sharedWorldFires.ts`'s rank, minus "visible", which every
 * Character here is (the device enabled the event for the browser channel).
 */
function better(a: NearbyFire, b: NearbyFire): boolean {
  return a.jumps !== b.jumps ? a.jumps < b.jumps : a.characterId < b.characterId;
}

export function computeDeviceNearby(input: DeviceNearbyInput): DeviceNearbyResult {
  const next: Record<string, StoredNearby> = { ...input.prev };
  const best = new Map<string, NearbyFire>();
  const offer = (fire: NearbyFire) => {
    const key = occurrenceKeyOf(fire);
    const held = best.get(key);
    if (held === undefined || better(fire, held)) best.set(key, fire);
  };

  for (const character of input.characters) {
    const id = String(character.characterId);
    const prev = input.prev[id] ?? {};
    const state: StoredNearby = {};
    let distances: ReadonlyMap<number, number> | null = null;
    const distancesOnce = () => (distances ??= input.distancesFrom(character.originSystemId));

    const incursionN = character.nearbyJumps.incursionNearby;
    if (character.events.includes('incursionNearby') && incursionN !== undefined) {
      if (input.lists.incursions === null) {
        if (prev.incursion) state.incursion = prev.incursion;
      } else {
        const entries = incursionEntries(
          input.lists.incursions,
          character.originSystemId,
          incursionN,
          distancesOnce
        );
        const snapshot: IncursionAlertSnapshot = { entries, nowMs: input.nowMs };
        const before = restore(
          prev.incursion,
          (frame): IncursionAlertEntry => ({
            constellationId: 0,
            stagingSystemId: 0,
            state: 'established',
            jumps: null,
            ...frame,
          }),
          input.nowMs
        );
        diffIncursionNearby(character.characterId, before, snapshot).forEach(offer);
        state.incursion = store(entries);
      }
    }

    const skyhookN = character.nearbyJumps.skyhookRaidableNearby;
    if (character.events.includes('skyhookRaidableNearby') && skyhookN !== undefined) {
      if (input.lists.skyhooks === null) {
        if (prev.skyhook) state.skyhook = prev.skyhook;
      } else {
        const entries = skyhookEntries(
          input.lists.skyhooks,
          character.originSystemId,
          skyhookN,
          distancesOnce
        );
        const snapshot: SkyhookAlertSnapshot = { entries, nowMs: input.nowMs };
        const before = restore(
          prev.skyhook,
          (frame): SkyhookAlertEntry => ({
            systemId: 0,
            planetId: 0,
            startMs: 0,
            endMs: 0,
            jumps: null,
            ...frame,
          }),
          input.nowMs
        );
        diffSkyhookRaidableNearby(character.characterId, before, snapshot).forEach(offer);
        // A closed window can never fire again: its next window is a new start.
        state.skyhook = store(entries, (entry) => entry.endMs > input.nowMs);
      }
    }

    next[id] = state;
  }

  return {
    fires: [...best].map(([occurrenceKey, fire]) => ({ fire, occurrenceKey })),
    next,
  };
}

/**
 * How long a device remembers it was pushed an occurrence: the app's
 * `TOAST_STALE_AFTER_MS`, past which a feed row no longer stops a toast either.
 * Covers a second Character coming into range of the same Incursion later.
 */
export const NEARBY_PUSH_LOG_TTL_MS = 24 * 60 * 60 * 1000;

/** Occurrence Key → epoch ms until which it is not pushed to this device again. */
export type NearbyPushLog = Record<string, number>;

export function notYetPushed(log: Readonly<NearbyPushLog>, key: string, nowMs: number): boolean {
  const until = log[key];
  return until === undefined || until <= nowMs;
}

/** The log with `keys` added and every expired entry dropped. */
export function recordPushed(
  log: Readonly<NearbyPushLog>,
  keys: readonly string[],
  nowMs: number
): NearbyPushLog {
  const kept: NearbyPushLog = {};
  for (const [key, until] of Object.entries(log)) if (until > nowMs) kept[key] = until;
  for (const key of keys) kept[key] = nowMs + NEARBY_PUSH_LOG_TTL_MS;
  return kept;
}
