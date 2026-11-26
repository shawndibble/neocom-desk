import { useEffect, useMemo, useState } from 'react';
import { createSyncedSetting } from '@/lib/useSyncedSetting';
import { useTicker } from '@/lib/ticker';
import { DEFAULT_SECURITY_PENALTY, type RoutePreferenceKind } from '@/engine/route/jumpRoute';
import { avoidListKey, effectiveAvoid } from '@/engine/route/avoidRules';
import { EDENCOM_SYSTEMS, TRIGLAVIAN_MINOR_VICTORY_SYSTEMS } from '@/engine/route/invasionSystems';
import { loadPodKills } from '@/features/route/routeSafetyData';
import { useAvoidedSystems } from './avoidedSystems';
import { ROUTE_PREFERENCES } from './routePreferences';
import { MINUTE_MS } from '@/lib/age';

export const ROUTE_PREFERENCE_KEY = 'sync.routePreference';
export const SECURITY_PENALTY_KEY = 'sync.routeSecurityPenalty';
export const LEGACY_ROUTE_PREFERENCE_KEY = 'assetsRoutePreference';
export const AVOIDED_SYSTEMS_ENABLED_KEY = 'sync.avoidedSystemsEnabled';
export const AVOID_EDENCOM_KEY = 'sync.avoidEdencom';
export const AVOID_TRIGLAVIAN_KEY = 'sync.avoidTriglavian';
export const AVOID_POD_KILLS_KEY = 'sync.avoidPodKills';
export const POD_KILL_THRESHOLD_KEY = 'sync.podKillThreshold';

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

export interface RouteRules {
  preference: RoutePreferenceKind;
  securityPenalty: number;
  avoid: readonly number[];
}

export interface TravelSettingsState extends RouteRules {
  hydrated: boolean;
  settingsHydrated: boolean;
  podKillsUnavailable: boolean;
}

const POD_KILL_REFRESH_MS = 15 * MINUTE_MS;

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

let podKillsLoad: { slot: number; promise: Promise<ReadonlyMap<number, number> | null> } | null =
  null;

export function clearPodKillsLoad(): void {
  podKillsLoad = null;
}

function podKillsFor(slot: number): Promise<ReadonlyMap<number, number> | null> {
  if (podKillsLoad?.slot !== slot) {
    podKillsLoad = { slot, promise: loadPodKills().catch(() => null) };
  }
  return podKillsLoad.promise;
}

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

interface AvoidSettings {
  avoidList: readonly number[];
  avoidListEnabled: boolean;
  avoidEdencom: boolean;
  avoidTriglavian: boolean;
  avoidPodKills: boolean;
  podKillThreshold: number;
}

function travelAvoid(
  settings: AvoidSettings,
  podKills: ReadonlyMap<number, number> | null
): number[] {
  return effectiveAvoid({
    ...settings,
    edencomSystems: EDENCOM_SYSTEMS,
    triglavianSystems: TRIGLAVIAN_MINOR_VICTORY_SYSTEMS,
    podKillsBySystem: podKills,
  });
}

export async function loadRouteRules(): Promise<RouteRules> {
  await Promise.all(ROUTE_RULE_STORES.map((store) => store.getState().hydrate()));
  const avoidPodKills = useAvoidPodKills.getState().value;
  const podKills = avoidPodKills
    ? await podKillsFor(Math.floor(Date.now() / POD_KILL_REFRESH_MS))
    : null;
  return {
    preference: useDefaultRoutePreference.getState().value,
    securityPenalty: useSecurityPenalty.getState().value,
    avoid: travelAvoid(
      {
        avoidList: useAvoidedSystems.getState().value,
        avoidListEnabled: useAvoidedSystemsEnabled.getState().value,
        avoidEdencom: useAvoidEdencom.getState().value,
        avoidTriglavian: useAvoidTriglavian.getState().value,
        avoidPodKills,
        podKillThreshold: usePodKillThreshold.getState().value,
      },
      podKills
    ),
  };
}

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
      travelAvoid(
        {
          avoidList,
          avoidListEnabled,
          avoidEdencom,
          avoidTriglavian,
          avoidPodKills,
          podKillThreshold,
        },
        podKills ?? null
      ).join(','),
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
  const avoid = useMemo(() => (avoidKey === '' ? [] : avoidKey.split(',').map(Number)), [avoidKey]);

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

export interface RouteQuery {
  rules: RouteRules;
  key: string;
  hydrated: boolean;
  podKillsUnavailable: boolean;
}

export function useRouteQuery(preferenceOverride?: RoutePreferenceKind | null): RouteQuery {
  const settings = useRouteRules();
  const preference = preferenceOverride ?? settings.preference;
  const { securityPenalty, avoid, hydrated, podKillsUnavailable } = settings;
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
