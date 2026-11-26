import { createLocalSetting } from '@/lib/useLocalSetting';

export const PI_GOAL_PLANNER_KEY = 'piGoalPlanner';

export interface GoalPlannerPrefs {
  fallbackRatePerHour: number;
  maxP0Types: 1 | 2;
}

export const DEFAULT_GOAL_PLANNER_PREFS: GoalPlannerPrefs = {
  fallbackRatePerHour: 6_000,
  maxP0Types: 2,
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
  };
}

export const useGoalPlannerPrefs = createLocalSetting<GoalPlannerPrefs>({
  key: PI_GOAL_PLANNER_KEY,
  defaultValue: DEFAULT_GOAL_PLANNER_PREFS,
  parse: parseGoalPlannerPrefs,
});
