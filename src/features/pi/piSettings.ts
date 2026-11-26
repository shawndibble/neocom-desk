import { db } from '@/db';
import { createSettingStore, type SettingStore } from '@/lib/settingStore';
import { DEFAULT_TRADE_HUB, TRADE_HUBS, type TradeHub } from '@/market/hubs';

export const PI_SETTINGS_KEY = 'piSettings';
const LEGACY_SOURCING_KEY = 'piMarketSourcing';
const LEGACY_GOAL_PLANNER_KEY = 'piGoalPlanner';

export const PI_BUY_TIERS = [1, 2, 3] as const;
export type PiBuyTier = (typeof PI_BUY_TIERS)[number];

export interface PiSettings {
  hub: TradeHub['id'];
  buybackPct: number | null;
  buyTiers: PiBuyTier[];
  hubChosen?: true;
  haulBetweenPlanets?: true;
}

export const DEFAULT_PI_SETTINGS: PiSettings = {
  hub: DEFAULT_TRADE_HUB.id,
  buybackPct: null,
  buyTiers: [],
};

export function withHaulBetweenPlanets(settings: PiSettings, on: boolean): PiSettings {
  const next: PiSettings = { ...settings };
  if (on) next.haulBetweenPlanets = true;
  else delete next.haulBetweenPlanets;
  return next;
}

const isHubId = (value: unknown): value is TradeHub['id'] =>
  TRADE_HUBS.some((hub) => hub.id === value);

const chosenFlag = (hub: TradeHub['id'], buybackPct: number | null): { hubChosen?: true } =>
  hub !== DEFAULT_PI_SETTINGS.hub || buybackPct !== null ? { hubChosen: true } : {};

export function parsePiSettings(raw: unknown): PiSettings | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const pct = value.buybackPct;
  const tiers = Array.isArray(value.buyTiers) ? value.buyTiers : [];
  const hub = isHubId(value.hub) ? value.hub : DEFAULT_PI_SETTINGS.hub;
  const buybackPct =
    typeof pct === 'number' && Number.isFinite(pct) && pct > 0 && pct <= 100 ? pct : null;
  return {
    hub,
    buybackPct,
    buyTiers: PI_BUY_TIERS.filter((tier) => tiers.includes(tier)),
    ...(value.hubChosen === true ? { hubChosen: true as const } : chosenFlag(hub, buybackPct)),
    ...(value.haulBetweenPlanets === true ? { haulBetweenPlanets: true as const } : {}),
  };
}

export function migrateLegacyPiSettings(sourcing: unknown, goalPlannerPrefs: unknown): PiSettings {
  const priceHub =
    typeof goalPlannerPrefs === 'object' && goalPlannerPrefs !== null
      ? (goalPlannerPrefs as { priceHub?: unknown }).priceHub
      : undefined;
  if (isHubId(sourcing)) {
    return {
      hub: sourcing,
      buybackPct: null,
      buyTiers: [1],
      ...chosenFlag(sourcing, null),
    };
  }
  const hub = isHubId(priceHub) ? priceHub : DEFAULT_PI_SETTINGS.hub;
  return {
    hub,
    buybackPct: null,
    buyTiers: [],
    ...chosenFlag(hub, null),
  };
}

export const usePiSettings: SettingStore<PiSettings> = createSettingStore<PiSettings>({
  defaultValue: DEFAULT_PI_SETTINGS,
  coerce: (raw) => parsePiSettings(raw) ?? DEFAULT_PI_SETTINGS,
  read: async () => {
    const row = await db.settings.get(PI_SETTINGS_KEY);
    if (row) return row;
    const [sourcing, goalPlanner] = await Promise.all([
      db.settings.get(LEGACY_SOURCING_KEY),
      db.settings.get(LEGACY_GOAL_PLANNER_KEY),
    ]);
    if (!sourcing && !goalPlanner) return undefined;
    return { value: migrateLegacyPiSettings(sourcing?.value, goalPlanner?.value) };
  },
  write: async (value) => {
    await db.settings.put({ key: PI_SETTINGS_KEY, value });
  },
});
