/**
 * Device-local: how the pilot's planetary industry meets a market. One record,
 * edited by the shared PI settings form (the PI page's gear and Settings), and
 * read by every PI tab, so no two surfaces ever price one operation at two
 * markets.
 *
 * - `hub`: the Trade Hub PI is priced at and sold to. Buying at the hub (when
 *   `buyTiers` is not empty) happens here too.
 * - `buybackPct`: a corp buyback in place of selling on the hub's market. It
 *   pays this percentage of the hub's price, so the hub is still the price
 *   basis. `null` sells on the market.
 * - `buyTiers`: the tiers the pilot is willing to buy at the hub when their
 *   colonies fall short, P1 to P3. Empty (the default) is the point: buying
 *   assumes a shop within reach, and the pilot this was built with is thirty
 *   minutes from one. The Advisor reads "any tier" as "buying on".
 *
 * The restart and haul cadence are the separate `cadencePref` record: they
 * answer how often the pilot logs in, not where they trade, and their stored
 * values are kept as they were.
 *
 * ## Migration
 *
 * This replaces two keys: `piMarketSourcing` (a hub id, or `'none'`) and the
 * Goal Planner's `priceHub` inside `piGoalPlanner`. With no `piSettings` row,
 * the first read derives one from them (`migrateLegacyPiSettings`); the legacy
 * rows are left where they are, as `useLocalSetting` leaves its own.
 */
import { db } from '@/db';
import { createSettingStore, type SettingStore } from '@/lib/settingStore';
import { DEFAULT_TRADE_HUB, TRADE_HUBS, type TradeHub } from '@/market/hubs';

export const PI_SETTINGS_KEY = 'piSettings';
const LEGACY_SOURCING_KEY = 'piMarketSourcing';
const LEGACY_GOAL_PLANNER_KEY = 'piGoalPlanner';

/** Tiers a pilot can opt to buy. P4 is out of scope. */
export const PI_BUY_TIERS = [1, 2, 3] as const;
export type PiBuyTier = (typeof PI_BUY_TIERS)[number];

/** The buyback rates offered, as a percent of the hub's price. */
export const PI_BUYBACK_PCT_OPTIONS = [80, 85, 90, 95] as const;
export const DEFAULT_BUYBACK_PCT = 90;

export interface PiSettings {
  hub: TradeHub['id'];
  buybackPct: number | null;
  buyTiers: PiBuyTier[];
  /**
   * True once the pilot picked or dismissed a hub, so the strip stops
   * suggesting the nearest one. Absent on the default; a stored row naming a
   * hub other than the default counts as chosen (that was a pick).
   */
  hubChosen?: true;
}

export const DEFAULT_PI_SETTINGS: PiSettings = {
  hub: DEFAULT_TRADE_HUB.id,
  buybackPct: null,
  buyTiers: [],
};

const isHubId = (value: unknown): value is TradeHub['id'] =>
  TRADE_HUBS.some((hub) => hub.id === value);

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
    ...(value.hubChosen === true || hub !== DEFAULT_PI_SETTINGS.hub || buybackPct !== null
      ? { hubChosen: true as const }
      : {}),
  };
}

/**
 * The settings the two legacy keys amount to: a stored hub in
 * `piMarketSourcing` is that hub with P1 buying on; `'none'` (or anything
 * unreadable, or the old boolean) is no buying. The hub, when buying is off,
 * is the Goal Planner's old `priceHub`.
 */
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
      ...(sourcing !== DEFAULT_PI_SETTINGS.hub ? { hubChosen: true as const } : {}),
    };
  }
  const hub = isHubId(priceHub) ? priceHub : DEFAULT_PI_SETTINGS.hub;
  return {
    hub,
    buybackPct: null,
    buyTiers: [],
    ...(hub !== DEFAULT_PI_SETTINGS.hub ? { hubChosen: true as const } : {}),
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
