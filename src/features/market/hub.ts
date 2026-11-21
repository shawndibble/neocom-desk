/**
 * The pilot's default Trade Hub — Settings' "Default Trade Hub" control, and
 * the hub the Contracts detail modal's market-value figure (issue #717), LP
 * Store, BPC Sourcing panel and notification polling price against absent a
 * more specific choice of their own.
 *
 * Synced across their devices: which hub you price at is a fact about how you
 * play, not about the machine you opened, and a pilot who trades out of Amarr
 * had to say so again on every device. Still **not** the Payee hub Moon Mining
 * bills at (`20260907-100006`) — that one is a term of an invoice and lives on
 * the Payee record; this one is a viewing preference and Moon Mining never
 * reads it.
 *
 * **Not** the Market Browser page's own current hub, which is device-local —
 * see `browserHub.ts`'s doc comment for why the two are split.
 *
 * Since issue #5593 there are two layers. `useDefaultMarketHub` is the
 * account-wide default (`sync.marketHub`, Settings' "Default Trade Hub for new
 * characters"); `useMarketHub` is the hub in force: the active Character's own
 * (`characterHubs.ts`), else the default, and the default alone with no active
 * Character. Every hub-reading surface reads `useMarketHub`, which keeps the
 * `value` / `hydrated` / `hydrate` / `setValue` shape of any setting store.
 * Its `setValue` writes the active Character's hub, or the default with none.
 *
 * Lives here rather than in `src/stores/` because other features (Contracts,
 * LP Store, BPC Sourcing, notification polling) import it from here rather
 * than each holding a duplicate hub preference of their own, the same way
 * they already share `src/market/hubs.ts`'s `TradeHub` list.
 */
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

/** What it was stored under before it synced; its value is adopted once. */
export const LEGACY_MARKET_HUB_SETTING_KEY = 'marketHub';

/** A stored hub id, if it still names a hub; a hub retired between releases is still a valid string. */
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

/**
 * The Global hub set to Closest (issue #6523). Its own key, so `sync.marketHub`
 * always holds a hub an older build can read; that hub (or the Character's
 * own) is also what Closest falls back to with no location.
 */
export const MARKET_HUB_CLOSEST_SETTING_KEY = 'sync.marketHubClosest';

export const useGlobalClosest = createSyncedSetting<boolean>({
  key: MARKET_HUB_CLOSEST_SETTING_KEY,
  defaultValue: false,
  parse: (raw) => (typeof raw === 'boolean' ? raw : null),
});

/** What a page uses, in order: its own entry, else Closest when the Global hub is set to it, else the Global hub. */
function choiceFor(
  map: Parameters<typeof ownChoice>[0],
  area: PageHubArea | undefined,
  globalClosest: boolean
): HubChoice | undefined {
  return (area ? ownChoice(map, area) : undefined) ?? (globalClosest ? CLOSEST : undefined);
}

/** A choice made a hub: Closest is the found hub, else `fallback` (no location); no choice is `fallback`. */
function resolveChoice(
  choice: HubChoice | undefined,
  closest: TradeHub['id'] | null,
  fallback: TradeHub['id']
): TradeHub['id'] {
  if (choice === CLOSEST) return closest ?? fallback;
  return choice ?? fallback;
}

/**
 * The hub `characterId` trades at (the account default when none), read from
 * Dexie-backed stores; with `area`, that page's own hub when it has one.
 * Closest is worked out for `characterId`'s location.
 */
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

/** `useHubFor(area)` outside React: the area's entry, else the active Character's Global hub. */
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
      // Never re-read a settled selection: the read would overwrite one already in force.
      useActiveCharacter.getState().hydrated ? undefined : useActiveCharacter.getState().hydrate(),
    ]);
    set(inForce());
  },
  setValue: async (hub) => {
    // Skipped when settled: the press must apply in the same tick, as every setting store's does.
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
    // Applied at once, as every setting store does; the writes follow.
    set({ value: hub });
    return useHubByCharacter
      .getState()
      .setValue(setCharacterHub(useHubByCharacter.getState().value, activeId, hub));
  },
}));

for (const source of [useDefaultMarketHub, useHubByCharacter, useActiveCharacter]) {
  source.subscribe(() => useMarketHub.setState(inForce()));
}

/** Where a page's hub comes from: the Global hub, or the page's own entry. */
export type HubScope = 'global' | 'page';

/**
 * `loadHubFor(area)` from the settled stores, at once: Closest is the last
 * answer worked out (the Global hub before there is one). For code that
 * cannot wait, after `loadHubFor` has run once.
 */
export function hubNowFor(area: PageHubArea): TradeHub['id'] {
  const choice = choiceFor(usePageHubs.getState().value, area, useGlobalClosest.getState().value);
  const characterId = useActiveCharacter.getState().activeCharacterId;
  const closest = choice === CLOSEST && characterId !== null ? closestHubKnown(characterId) : null;
  return resolveChoice(choice, closest, useMarketHub.getState().value);
}

export interface PageHub {
  /** The hub `area` prices at: Closest resolved, or the Global hub while it cannot be. */
  hubId: TradeHub['id'];
  /** What the page is set to: a hub, or Closest (its own entry, else the Global hub's). */
  choice: HubChoice;
  /** Closest is chosen and found from the Character's location; false while it falls back to Global. */
  closestFound: boolean;
  scope: HubScope;
  hydrated: boolean;
}

/** The hub `area` prices at and where it comes from, re-rendering when any store it reads changes. */
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

/** Writes the Global hub: Closest sets its flag (the stored hub stays the fallback); a hub clears it. */
async function setGlobalChoice(choice: HubChoice): Promise<void> {
  const closest = useGlobalClosest.getState();
  if (choice === CLOSEST) return closest.setValue(true);
  if (closest.value) await closest.setValue(false);
  return useMarketHub.getState().setValue(choice);
}

/**
 * A hub (or Closest) picked on `area`'s picker: its own entry when it has one,
 * else the Global hub, which moves every page without an entry.
 */
export async function pickHubFor(area: PageHubArea, choice: HubChoice): Promise<void> {
  // Skipped when settled: the press must apply in the same tick, as every setting store's does.
  if (!usePageHubs.getState().hydrated || !useGlobalClosest.getState().hydrated) {
    await Promise.all([usePageHubs.getState().hydrate(), useGlobalClosest.getState().hydrate()]);
  }
  const map = usePageHubs.getState().value;
  if (ownChoice(map, area)) return usePageHubs.getState().setValue(setPageHub(map, area, choice));
  return setGlobalChoice(choice);
}

/** The Global hub the Settings control picks: as a page on Global picks it. */
export async function pickGlobalHub(choice: HubChoice): Promise<void> {
  if (!useGlobalClosest.getState().hydrated) await useGlobalClosest.getState().hydrate();
  return setGlobalChoice(choice);
}

/**
 * Switches `area` between Global and its own hub, keeping its own: back to
 * Global sets the entry aside (`useParkedPageHubs`), and the page's own hub
 * comes back from there. A page that never had one starts at what it uses now
 * (Closest when the Global hub is), so nothing re-prices. Only Settings'
 * Remove forgets a page's hub.
 */
export async function setHubScope(area: PageHubArea, scope: HubScope): Promise<void> {
  const stores = [usePageHubs, useParkedPageHubs, useMarketHub, useGlobalClosest] as const;
  // Skipped when settled: the press must apply in the same tick, as every setting store's does.
  if (stores.some((store) => !store.getState().hydrated)) {
    await Promise.all(stores.map((store) => store.getState().hydrate()));
  }
  // Both maps are read and written in one tick, never across an await: a second
  // press, a hub pick or a sync pull in between would otherwise be overwritten.
  // Each `setValue` updates its store at once; only the persisting is awaited.
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

/**
 * Gives `area` its own entry at `hub`, whatever it used before: for a choice
 * that belongs to that page alone, such as a Market link naming a hub, which
 * must never move the pages on Global.
 */
export async function setPageHubEntry(area: PageHubArea, hub: TradeHub['id']): Promise<void> {
  if (!usePageHubs.getState().hydrated || !useParkedPageHubs.getState().hydrated) {
    await Promise.all([usePageHubs.getState().hydrate(), useParkedPageHubs.getState().hydrate()]);
  }
  const map = usePageHubs.getState().value;
  const parkedMap = useParkedPageHubs.getState().value;
  // A hub set aside is superseded: the page has its own again, so no stale copy is kept.
  await Promise.all([
    ownChoice(map, area) === hub
      ? undefined
      : usePageHubs.getState().setValue(setPageHub(map, area, hub)),
    area in parkedMap
      ? useParkedPageHubs.getState().setValue(dropPageHub(parkedMap, area))
      : undefined,
  ]);
}
