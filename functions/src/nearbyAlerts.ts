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

export interface NearbyRouteRules {
  preference: RoutePreferenceKind;
  securityPenalty: number;
  avoid: readonly number[];
}

export const DEFAULT_NEARBY_ROUTE_RULES: NearbyRouteRules = {
  preference: 'prefer-highsec',
  securityPenalty: DEFAULT_SECURITY_PENALTY,
  avoid: [],
};

export interface RaidableSkyhook {
  solar_system_id: number;
  planet_id: number;
  theft_vulnerability?: { start: string; end: string };
}

export interface IncursionListing {
  constellation_id: number;
  staging_solar_system_id: number;
  state: string;
}

export interface NearbyLists {
  skyhooks: readonly RaidableSkyhook[] | null;
  incursions: readonly IncursionListing[] | null;
}

export interface NearbyFrame {
  originSystemId: number;
  withinJumps: number;
}

export interface StoredSnapshot<Entry> {
  frame: NearbyFrame | null;
  inRange: Entry[];
}

export interface StoredNearby {
  incursion?: StoredSnapshot<IncursionAlertEntry>;
  skyhook?: StoredSnapshot<SkyhookAlertEntry>;
}

export interface DeviceCharacterNearby {
  characterId: number;
  originSystemId: number;
  events: readonly string[];
  nearbyJumps: Partial<Record<NearbyEventId, number>>;
}

export type NearbyFire = IncursionNearbyFire | SkyhookRaidableNearbyFire;

export interface KeyedNearbyFire {
  fire: NearbyFire;
  occurrenceKey: string;
}

export function skyhookRaidableNearbyOccurrenceKey(
  systemId: number,
  planetId: number,
  startMs: number
): string {
  return ['skyhookRaidableNearby', systemId, planetId, startMs].join(':');
}

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
  characters: readonly DeviceCharacterNearby[];
  prev: Readonly<Record<string, StoredNearby>>;
  lists: NearbyLists;
  nowMs: number;
  distancesFrom: (originSystemId: number) => ReadonlyMap<number, number>;
}

export interface DeviceNearbyResult {
  fires: KeyedNearbyFire[];
  next: Record<string, StoredNearby>;
}

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

export type NearbyPushLog = Record<string, number>;

export interface LiveOccurrences {
  incursions: ReadonlySet<string> | null;
  skyhooks: ReadonlySet<string> | null;
}

export function liveOccurrences(lists: NearbyLists, nowMs: number): LiveOccurrences {
  return {
    incursions:
      lists.incursions === null
        ? null
        : new Set(
            lists.incursions.map((i) =>
              incursionNearbyOccurrenceKey(i.constellation_id, i.staging_solar_system_id)
            )
          ),
    skyhooks:
      lists.skyhooks === null
        ? null
        : new Set(
            lists.skyhooks.flatMap((hook) => {
              const startMs = parseInstant(hook.theft_vulnerability?.start);
              const endMs = parseInstant(hook.theft_vulnerability?.end);
              return startMs === null || endMs === null || endMs <= nowMs
                ? []
                : [
                    skyhookRaidableNearbyOccurrenceKey(
                      hook.solar_system_id,
                      hook.planet_id,
                      startMs
                    ),
                  ];
            })
          ),
  };
}

export function notYetPushed(log: Readonly<NearbyPushLog>, key: string): boolean {
  return log[key] === undefined;
}

export function recordPushed(
  log: Readonly<NearbyPushLog>,
  keys: readonly string[],
  nowMs: number,
  live: LiveOccurrences
): NearbyPushLog {
  const stillListed = (key: string) => {
    const set = key.startsWith('incursionNearby:') ? live.incursions : live.skyhooks;
    return set === null || set.has(key);
  };
  const kept: NearbyPushLog = {};
  for (const [key, at] of Object.entries(log)) if (stillListed(key)) kept[key] = at;
  for (const key of keys) kept[key] = nowMs;
  return kept;
}
