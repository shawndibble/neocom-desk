/**
 * Device-local: the Goal Planner's standing assumptions — facts about how the
 * pilot operates, not about the goals on screen, so they live on disk rather
 * than in the URL.
 *
 * - `fallbackRatePerHour`: P0/h one ECU yields, used only where nothing the
 *   pilot runs is measured (`goalPlannerModel.ts`'s rate chain).
 * - `maxP0Types`: distinct P0s one colony may extract (one ECU each, or both
 *   ECUs on one). Two by default — one per planet turned ordinary two-ECU
 *   colonies into false shortfalls (scope decision 2026-10-04).
 * - `priceHub`: where the plan is priced while buying is off. Buying itself is
 *   the shared `marketSourcingPref` (the Advisor's buy-inputs switch): when it
 *   names a hub, that hub prices the plan too, so the two tabs never price one
 *   pilot's operation at two markets.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';
import { TRADE_HUBS, type TradeHub } from '@/market/hubs';

export const PI_GOAL_PLANNER_KEY = 'piGoalPlanner';

export interface GoalPlannerPrefs {
  fallbackRatePerHour: number;
  maxP0Types: 1 | 2;
  priceHub: TradeHub['id'];
}

export const DEFAULT_GOAL_PLANNER_PREFS: GoalPlannerPrefs = {
  fallbackRatePerHour: 6_000,
  maxP0Types: 2,
  priceHub: 'jita',
};

export function parseGoalPlannerPrefs(raw: unknown): GoalPlannerPrefs | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const value = raw as Partial<Record<keyof GoalPlannerPrefs, unknown>>;
  const rate = value.fallbackRatePerHour;
  return {
    fallbackRatePerHour:
      typeof rate === 'number' && Number.isFinite(rate) && rate > 0
        ? rate
        : DEFAULT_GOAL_PLANNER_PREFS.fallbackRatePerHour,
    maxP0Types:
      value.maxP0Types === 1 || value.maxP0Types === 2
        ? value.maxP0Types
        : DEFAULT_GOAL_PLANNER_PREFS.maxP0Types,
    priceHub: TRADE_HUBS.some((hub) => hub.id === value.priceHub)
      ? (value.priceHub as TradeHub['id'])
      : DEFAULT_GOAL_PLANNER_PREFS.priceHub,
  };
}

export const useGoalPlannerPrefs = createLocalSetting<GoalPlannerPrefs>({
  key: PI_GOAL_PLANNER_KEY,
  defaultValue: DEFAULT_GOAL_PLANNER_PREFS,
  parse: parseGoalPlannerPrefs,
});
