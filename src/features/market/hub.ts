import { create } from 'zustand';
import { createSyncedSetting } from '@/lib/useSyncedSetting';
import { useHydratedStore } from '@/lib/useHydratedStore';
import type { SettingState } from '@/lib/settingStore';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { DEFAULT_TRADE_HUB, getTradeHub, type TradeHub } from '@/market/hubs';
import { resolveTradeHub, setCharacterHub, useHubByCharacter } from './characterHubs';
import {
  CLOSEST,
  dropPageHub,
  ownChoice,
  setPageHub,
  usePageHubs,
  useParkedPageHubs,
  type HubChoice,
  type PageHubArea,
} from './pageHubs';
import { closestHubKnown, loadClosestHub, useClosestHub } from './closestHub';

export const MARKET_HUB_SETTING_KEY = 'sync.marketHub';

export const LEGACY_MARKET_HUB_SETTING_KEY = 'marketHub';

export function parseMarketHub(raw: unknown): TradeHub['id'] | null {
  return typeof raw === 'string' && getTradeHub(raw as TradeHub['id'])
    ? (raw as TradeHub['id'])
    : null;
}

export const useDefaultMarketHub = createSyncedSetting<TradeHub['id']>({
  key: MARKET_HUB_SETTING_KEY,
  legacyKey: LEGACY_MARKET_HUB_SETTING_KEY,
  defaultValue: DEFAULT_TRADE_HUB.id,
  parse: parseMarketHub,
});

export const MARKET_HUB_CLOSEST_SETTING_KEY = 'sync.marketHubClosest';

export const useGlobalClosest = createSyncedSetting<boolean>({
  key: MARKET_HUB_CLOSEST_SETTING_KEY,
  defaultValue: false,
  parse: (raw) => (typeof raw === 'boolean' ? raw : null),
});

function choiceFor(
  map: Parameters<typeof ownChoice>[0],
  area: PageHubArea | undefined,
  globalClosest: boolean
): HubChoice | undefined {
  return (area ? ownChoice(map, area) : undefined) ?? (globalClosest ? CLOSEST : undefined);
}

function resolveChoice(
  choice: HubChoice | undefined,
  closest: TradeHub['id'] | null,
  fallback: TradeHub['id']
): TradeHub['id'] {
  if (choice === CLOSEST) return closest ?? fallback;
  return choice ?? fallback;
}

export async function tradeHubIdFor(
  characterId: number | null,
  area?: PageHubArea
): Promise<TradeHub['id']> {
  await Promise.all([
    useDefaultMarketHub.getState().hydrate(),
    useHubByCharacter.getState().hydrate(),
    useGlobalClosest.getState().hydrate(),
    area ? usePageHubs.getState().hydrate() : undefined,
  ]);
  const global = resolveTradeHub(
    useHubByCharacter.getState().value,
    characterId,
    useDefaultMarketHub.getState().value
  );
  const choice = choiceFor(usePageHubs.getState().value, area, useGlobalClosest.getState().value);
  const closest =
    choice === CLOSEST && characterId !== null ? await loadClosestHub(characterId) : null;
  return resolveChoice(choice, closest, global);
}

export async function loadHubFor(area: PageHubArea): Promise<TradeHub['id']> {
  await Promise.all([
    usePageHubs.getState().hydrate(),
    useMarketHub.getState().hydrate(),
    useGlobalClosest.getState().hydrate(),
  ]);
  const choice = choiceFor(usePageHubs.getState().value, area, useGlobalClosest.getState().value);
  const characterId = useActiveCharacter.getState().activeCharacterId;
  const closest =
    choice === CLOSEST && characterId !== null ? await loadClosestHub(characterId) : null;
  return resolveChoice(choice, closest, useMarketHub.getState().value);
}

function inForce(): Pick<SettingState<TradeHub['id']>, 'value' | 'hydrated'> {
  const base = useDefaultMarketHub.getState();
  const byCharacter = useHubByCharacter.getState();
  const active = useActiveCharacter.getState();
  return {
    value: resolveTradeHub(byCharacter.value, active.activeCharacterId, base.value),
    hydrated: base.hydrated && byCharacter.hydrated && active.hydrated,
  };
}

export const useMarketHub = create<SettingState<TradeHub['id']>>((set, get) => ({
  ...inForce(),
  hydrate: async () => {
    if (get().hydrated) return;
    await Promise.all([
      useDefaultMarketHub.getState().hydrate(),
      useHubByCharacter.getState().hydrate(),
      useActiveCharacter.getState().hydrated ? undefined : useActiveCharacter.getState().hydrate(),
    ]);
    set(inForce());
  },
  setValue: async (hub) => {
    if (!useHubByCharacter.getState().hydrated || !useActiveCharacter.getState().hydrated) {
      await Promise.all([
        useHubByCharacter.getState().hydrate(),
        useActiveCharacter.getState().hydrated
          ? undefined
          : useActiveCharacter.getState().hydrate(),
      ]);
    }
    const activeId = useActiveCharacter.getState().activeCharacterId;
    if (activeId === null) return useDefaultMarketHub.getState().setValue(hub);
    set({ value: hub });
    return useHubByCharacter
      .getState()
      .setValue(setCharacterHub(useHubByCharacter.getState().value, activeId, hub));
  },
}));

for (const source of [useDefaultMarketHub, useHubByCharacter, useActiveCharacter]) {
  source.subscribe(() => useMarketHub.setState(inForce()));
}

export type HubScope = 'global' | 'page';

export function hubNowFor(area: PageHubArea): TradeHub['id'] {
  const choice = choiceFor(usePageHubs.getState().value, area, useGlobalClosest.getState().value);
  const characterId = useActiveCharacter.getState().activeCharacterId;
  const closest = choice === CLOSEST && characterId !== null ? closestHubKnown(characterId) : null;
  return resolveChoice(choice, closest, useMarketHub.getState().value);
}

export interface PageHub {
  hubId: TradeHub['id'];
  choice: HubChoice;
  closestFound: boolean;
  scope: HubScope;
  hydrated: boolean;
}

export function useHubFor(area: PageHubArea): PageHub {
  const map = usePageHubs((s) => s.value);
  const global = useMarketHub((s) => s.value);
  const globalClosest = useGlobalClosest((s) => s.value);
  const characterId = useActiveCharacter((s) => s.activeCharacterId);
  const storesHydrated = useHydratedStore(usePageHubs, useMarketHub, useGlobalClosest);
  const choice = choiceFor(map, area, globalClosest);
  const closest = useClosestHub(characterId, storesHydrated && choice === CLOSEST);
  return {
    hubId: resolveChoice(choice, closest.hubId, global),
    choice: choice ?? global,
    closestFound: choice === CLOSEST && closest.hubId !== null,
    scope: ownChoice(map, area) ? 'page' : 'global',
    hydrated: storesHydrated && closest.loaded,
  };
}

async function setGlobalChoice(choice: HubChoice): Promise<void> {
  const closest = useGlobalClosest.getState();
  if (choice === CLOSEST) return closest.setValue(true);
  if (closest.value) await closest.setValue(false);
  return useMarketHub.getState().setValue(choice);
}

export async function pickHubFor(area: PageHubArea, choice: HubChoice): Promise<void> {
  if (!usePageHubs.getState().hydrated || !useGlobalClosest.getState().hydrated) {
    await Promise.all([usePageHubs.getState().hydrate(), useGlobalClosest.getState().hydrate()]);
  }
  const map = usePageHubs.getState().value;
  if (ownChoice(map, area)) return usePageHubs.getState().setValue(setPageHub(map, area, choice));
  return setGlobalChoice(choice);
}

export async function pickGlobalHub(choice: HubChoice): Promise<void> {
  if (!useGlobalClosest.getState().hydrated) await useGlobalClosest.getState().hydrate();
  return setGlobalChoice(choice);
}

export async function setHubScope(area: PageHubArea, scope: HubScope): Promise<void> {
  const stores = [usePageHubs, useParkedPageHubs, useMarketHub, useGlobalClosest] as const;
  if (stores.some((store) => !store.getState().hydrated)) {
    await Promise.all(stores.map((store) => store.getState().hydrate()));
  }
  const map = usePageHubs.getState().value;
  const parkedMap = useParkedPageHubs.getState().value;
  if (scope === 'global') {
    const own = ownChoice(map, area);
    if (!own) return;
    await Promise.all([
      useParkedPageHubs.getState().setValue(setPageHub(parkedMap, area, own)),
      usePageHubs.getState().setValue(dropPageHub(map, area)),
    ]);
    return;
  }
  if (ownChoice(map, area)) return;
  const start: HubChoice =
    ownChoice(parkedMap, area) ??
    (useGlobalClosest.getState().value ? CLOSEST : useMarketHub.getState().value);
  await Promise.all([
    usePageHubs.getState().setValue(setPageHub(map, area, start)),
    area in parkedMap
      ? useParkedPageHubs.getState().setValue(dropPageHub(parkedMap, area))
      : undefined,
  ]);
}

export async function setPageHubEntry(area: PageHubArea, hub: TradeHub['id']): Promise<void> {
  if (!usePageHubs.getState().hydrated || !useParkedPageHubs.getState().hydrated) {
    await Promise.all([usePageHubs.getState().hydrate(), useParkedPageHubs.getState().hydrate()]);
  }
  const map = usePageHubs.getState().value;
  const parkedMap = useParkedPageHubs.getState().value;
  await Promise.all([
    ownChoice(map, area) === hub
      ? undefined
      : usePageHubs.getState().setValue(setPageHub(map, area, hub)),
    area in parkedMap
      ? useParkedPageHubs.getState().setValue(dropPageHub(parkedMap, area))
      : undefined,
  ]);
}
