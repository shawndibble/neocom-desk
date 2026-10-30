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
import type { SettingState } from '@/lib/settingStore';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { DEFAULT_TRADE_HUB, getTradeHub, type TradeHub } from '@/market/hubs';
import { resolveTradeHub, setCharacterHub, useHubByCharacter } from './characterHubs';

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

/** The hub `characterId` trades at (the account default when none), read from Dexie-backed stores. */
export async function tradeHubIdFor(characterId: number | null): Promise<TradeHub['id']> {
  await Promise.all([
    useDefaultMarketHub.getState().hydrate(),
    useHubByCharacter.getState().hydrate(),
  ]);
  return resolveTradeHub(
    useHubByCharacter.getState().value,
    characterId,
    useDefaultMarketHub.getState().value
  );
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
      useActiveCharacter.getState().hydrate(),
    ]);
    set(inForce());
  },
  setValue: async (hub) => {
    // Skipped when settled: the press must apply in the same tick, as every setting store's does.
    if (!useHubByCharacter.getState().hydrated || !useActiveCharacter.getState().hydrated) {
      await Promise.all([
        useHubByCharacter.getState().hydrate(),
        useActiveCharacter.getState().hydrate(),
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
