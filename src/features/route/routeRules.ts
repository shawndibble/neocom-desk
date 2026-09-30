/**
 * The pilot's **Travel Settings** — the in-game autopilot's route options,
 * for planning: which trip to prefer, and which systems to keep out of. Every
 * jump count in the app reads them through `useRouteRules`, so no page
 * carries its own copy of the rules.
 *
 * Only what ESI's `/route/` can also honour is offered — a preference, the
 * game's security penalty, and an avoid list: Assets and market order jumps
 * still ask ESI, and a setting only some pages obeyed would quote two
 * distances for one trip. The local graph weighs routes with CCP's own
 * published costs (`engine/route/jumpRoute.ts`), so both agree.
 *
 * Each setting is its own synced key, so changing one on a laptop cannot roll
 * back another changed on a phone (`sync/syncedSettings.ts`).
 */
import { useEffect, useMemo, useState } from 'react';
import { createSyncedSetting } from '@/lib/useSyncedSetting';
import { useTicker } from '@/lib/ticker';
import { DEFAULT_SECURITY_PENALTY, type RoutePreferenceKind } from '@/engine/route/jumpRoute';
import { avoidListKey, effectiveAvoid } from '@/engine/route/avoidRules';
import { EDENCOM_SYSTEMS, TRIGLAVIAN_MINOR_VICTORY_SYSTEMS } from '@/engine/route/invasionSystems';
import { loadPodKills } from '@/features/travel/routeSafetyData';
import { useAvoidedSystems } from './avoidedSystems';
import { ROUTE_PREFERENCES } from './routePreferences';

export const ROUTE_PREFERENCE_KEY = 'sync.routePreference';
export const SECURITY_PENALTY_KEY = 'sync.routeSecurityPenalty';
/** The Assets page's device-local Shortest/Safest, adopted once as this setting's first value. */
export const LEGACY_ROUTE_PREFERENCE_KEY = 'assetsRoutePreference';
export const AVOIDED_SYSTEMS_ENABLED_KEY = 'sync.avoidedSystemsEnabled';
export const AVOID_EDENCOM_KEY = 'sync.avoidEdencom';
export const AVOID_TRIGLAVIAN_KEY = 'sync.avoidTriglavian';
export const AVOID_POD_KILLS_KEY = 'sync.avoidPodKills';
export const POD_KILL_THRESHOLD_KEY = 'sync.podKillThreshold';

/** Prefer safer: the trip most pilots actually fly, and what Courier and Travel already opened on. */
export const DEFAULT_ROUTE_PREFERENCE: RoutePreferenceKind = 'prefer-highsec';
export const MIN_SECURITY_PENALTY = 0;
export const MAX_SECURITY_PENALTY = 100;
export const DEFAULT_POD_KILL_THRESHOLD = 3;
export const MIN_POD_KILL_THRESHOLD = 1;
export const MAX_POD_KILL_THRESHOLD = 100;

export function parseRoutePreference(raw: unknown): RoutePreferenceKind | null {
  if (raw === 'safest') return 'prefer-highsec';
  return typeof raw === 'string' && (ROUTE_PREFERENCES as readonly string[]).includes(raw)
    ? (raw as RoutePreferenceKind)
    : null;
}

/** A stored whole number in `[min, max]`, or `null` — the parse both numeric Travel Settings share. */
function intInRange(min: number, max: number): (raw: unknown) => number | null {
  return (raw) =>
    typeof raw === 'number' && Number.isInteger(raw) && raw >= min && raw <= max ? raw : null;
}

export const parsePodKillThreshold = intInRange(MIN_POD_KILL_THRESHOLD, MAX_POD_KILL_THRESHOLD);
export const parseSecurityPenalty = intInRange(MIN_SECURITY_PENALTY, MAX_SECURITY_PENALTY);

export const useDefaultRoutePreference = createSyncedSetting<RoutePreferenceKind>({
  key: ROUTE_PREFERENCE_KEY,
  legacyKey: LEGACY_ROUTE_PREFERENCE_KEY,
  defaultValue: DEFAULT_ROUTE_PREFERENCE,
  parse: parseRoutePreference,
});

export const useSecurityPenalty = createSyncedSetting<number>({
  key: SECURITY_PENALTY_KEY,
  defaultValue: DEFAULT_SECURITY_PENALTY,
  parse: parseSecurityPenalty,
});

export const useAvoidedSystemsEnabled = createSyncedSetting<boolean>({
  key: AVOIDED_SYSTEMS_ENABLED_KEY,
  defaultValue: true,
});

export const useAvoidEdencom = createSyncedSetting<boolean>({
  key: AVOID_EDENCOM_KEY,
  defaultValue: false,
});

export const useAvoidTriglavian = createSyncedSetting<boolean>({
  key: AVOID_TRIGLAVIAN_KEY,
  defaultValue: false,
});

export const useAvoidPodKills = createSyncedSetting<boolean>({
  key: AVOID_POD_KILLS_KEY,
  defaultValue: false,
});

export const usePodKillThreshold = createSyncedSetting<number>({
  key: POD_KILL_THRESHOLD_KEY,
  defaultValue: DEFAULT_POD_KILL_THRESHOLD,
  parse: parsePodKillThreshold,
});

/** Every Travel setting store, for a caller that has to hydrate them all. */
export const ROUTE_RULE_STORES = [
  useDefaultRoutePreference,
  useSecurityPenalty,
  useAvoidedSystems,
  useAvoidedSystemsEnabled,
  useAvoidEdencom,
  useAvoidTriglavian,
  useAvoidPodKills,
  usePodKillThreshold,
] as const;

/** What one route is asked under — the shape every jump count, local or ESI, takes. */
export interface RouteRules {
  /** The pilot's default; a page with its own picker passes its choice instead. */
  preference: RoutePreferenceKind;
  /** 0–100: how strongly `preference` bends the route, as the game's slider does. */
  securityPenalty: number;
  /** Every system to keep out of, sorted — see `engine/route/avoidRules.ts`. */
  avoid: readonly number[];
}

/** The Travel Settings as `useRouteRules` reads them. */
export interface TravelSettingsState extends RouteRules {
  /**
   * False until every setting has been read — and, with pod-kill avoidance
   * on, the kill feed too — so nothing routes once on defaults.
   */
  hydrated: boolean;
  /** Every setting has been read; the kill feed may still be loading. For a settings form. */
  settingsHydrated: boolean;
  /** Pod-kill avoidance is on but the kill feed could not be read. */
  podKillsUnavailable: boolean;
}

/** The kill feed refreshes about hourly; asking this often is a cache read in between. */
const POD_KILL_REFRESH_MS = 15 * 60_000;

function useHydratedAll(): boolean {
  const flags = [
    useDefaultRoutePreference((state) => state.hydrated),
    useSecurityPenalty((state) => state.hydrated),
    useAvoidedSystems((state) => state.hydrated),
    useAvoidedSystemsEnabled((state) => state.hydrated),
    useAvoidEdencom((state) => state.hydrated),
    useAvoidTriglavian((state) => state.hydrated),
    useAvoidPodKills((state) => state.hydrated),
    usePodKillThreshold((state) => state.hydrated),
  ];
  useEffect(() => {
    for (const store of ROUTE_RULE_STORES) void store.getState().hydrate();
  }, []);
  return flags.every(Boolean);
}

/**
 * One kill-feed read per refresh slot for the whole app: every mounted route
 * consumer asks, and each would otherwise read and index the feed itself.
 */
let podKillsLoad: { slot: number; promise: Promise<ReadonlyMap<number, number> | null> } | null =
  null;

/** Forgets the shared kill-feed read — tests only. */
export function clearPodKillsLoad(): void {
  podKillsLoad = null;
}

function podKillsFor(slot: number): Promise<ReadonlyMap<number, number> | null> {
  if (podKillsLoad?.slot !== slot) {
    podKillsLoad = { slot, promise: loadPodKills().catch(() => null) };
  }
  return podKillsLoad.promise;
}

/** Pod kills by system while the rule is on; `undefined` while loading. */
function usePodKills(enabled: boolean): ReadonlyMap<number, number> | null | undefined {
  const now = useTicker(POD_KILL_REFRESH_MS);
  const refreshSlot = Math.floor(now / POD_KILL_REFRESH_MS);
  const [kills, setKills] = useState<ReadonlyMap<number, number> | null | undefined>(undefined);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void podKillsFor(refreshSlot).then((next) => {
      if (!cancelled) setKills(next);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, refreshSlot]);
  return enabled ? kills : null;
}

/**
 * The Travel Settings as one value, stable while none of them change — so a
 * caller can key an effect or a cache on `avoid` directly.
 */
export function useRouteRules(): TravelSettingsState {
  const hydratedAll = useHydratedAll();
  const preference = useDefaultRoutePreference((state) => state.value);
  const securityPenalty = useSecurityPenalty((state) => state.value);
  const avoidList = useAvoidedSystems((state) => state.value);
  const avoidListEnabled = useAvoidedSystemsEnabled((state) => state.value);
  const avoidEdencom = useAvoidEdencom((state) => state.value);
  const avoidTriglavian = useAvoidTriglavian((state) => state.value);
  const avoidPodKills = useAvoidPodKills((state) => state.value);
  const podKillThreshold = usePodKillThreshold((state) => state.value);
  const podKills = usePodKills(hydratedAll && avoidPodKills);

  const avoidKey = useMemo(
    () =>
      effectiveAvoid({
        avoidList,
        avoidListEnabled,
        avoidEdencom,
        edencomSystems: EDENCOM_SYSTEMS,
        avoidTriglavian,
        triglavianSystems: TRIGLAVIAN_MINOR_VICTORY_SYSTEMS,
        avoidPodKills,
        podKillThreshold,
        podKillsBySystem: podKills ?? null,
      }).join(','),
    [
      avoidList,
      avoidListEnabled,
      avoidEdencom,
      avoidTriglavian,
      avoidPodKills,
      podKillThreshold,
      podKills,
    ]
  );
  // Rebuilt from its key, so an equal list keeps its identity when the feed refreshes unchanged.
  const avoid = useMemo(() => (avoidKey === '' ? [] : avoidKey.split(',').map(Number)), [avoidKey]);

  // Pod-kill avoidance waits for its feed too, or every route would be drawn
  // once without those systems and then again with them.
  const hydrated = hydratedAll && !(avoidPodKills && podKills === undefined);

  return useMemo(
    () => ({
      preference,
      securityPenalty,
      avoid,
      hydrated,
      settingsHydrated: hydratedAll,
      podKillsUnavailable: avoidPodKills && podKills === null,
    }),
    [preference, securityPenalty, avoid, hydrated, hydratedAll, avoidPodKills, podKills]
  );
}

/** The rules one route is asked under, and a string that changes exactly when they do. */
export interface RouteQuery {
  /** Stable while the rules are: its identity changes only with `key`. */
  rules: RouteRules;
  /** For keying an effect's answer or a cache; the avoid list goes in hashed. */
  key: string;
  hydrated: boolean;
  podKillsUnavailable: boolean;
}

/**
 * The Travel Settings as a route query — the shape every jump count takes.
 * `preferenceOverride` is a page's own picker (a URL value, say); `null` or
 * `undefined` falls through to the pilot's default.
 */
export function useRouteQuery(preferenceOverride?: RoutePreferenceKind | null): RouteQuery {
  const settings = useRouteRules();
  const preference = preferenceOverride ?? settings.preference;
  const { securityPenalty, avoid, hydrated, podKillsUnavailable } = settings;
  // Memoized apart from the loading flags, so an effect keyed on `rules` does
  // not re-run when only `hydrated` or the feed's availability changes.
  const rules = useMemo(
    () => ({ preference, securityPenalty, avoid }),
    [preference, securityPenalty, avoid]
  );
  return useMemo(
    () => ({
      rules,
      key: `${preference}:${securityPenalty}:${avoidListKey(avoid)}`,
      hydrated,
      podKillsUnavailable,
    }),
    [rules, preference, securityPenalty, avoid, hydrated, podKillsUnavailable]
  );
}
