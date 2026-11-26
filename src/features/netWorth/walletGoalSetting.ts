import { GOAL_MAX_TARGET } from '@/engine/netWorth/waiting';
import { createLocalSetting } from '@/lib/useLocalSetting';

export interface WalletGoal {
  id: string;
  name: string;
  target: number | null;
  fittingId: string | null;
  fittingName: string | null;
}

function parseGoal(raw: unknown, fallbackId: string): WalletGoal | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const { id, name, target, fittingId, fittingName } = raw as Record<string, unknown>;
  if (typeof name !== 'string') return null;
  const fixed =
    typeof target === 'number' && target > 0 && target <= GOAL_MAX_TARGET ? target : null;
  const fitting = typeof fittingId === 'string' && fittingId !== '' ? fittingId : null;
  if (fixed === null && fitting === null) return null;
  return {
    id: typeof id === 'string' && id !== '' ? id : fallbackId,
    name,
    target: fixed,
    fittingId: fixed === null ? fitting : null,
    fittingName: fixed === null && typeof fittingName === 'string' ? fittingName : null,
  };
}

export function parseWalletGoals(raw: unknown): readonly WalletGoal[] | null {
  if (raw === null || raw === undefined) return [];
  if (Array.isArray(raw)) {
    const goals = raw
      .map((entry, index) => parseGoal(entry, `goal-${index}`))
      .filter((goal): goal is WalletGoal => goal !== null);
    return [...new Map(goals.map((goal) => [goal.id, goal])).values()];
  }
  const legacy = parseGoal(raw, 'goal-0');
  return legacy ? [legacy] : [];
}

export const useWalletGoals = createLocalSetting<readonly WalletGoal[]>({
  key: 'walletGoal',
  defaultValue: [],
  parse: parseWalletGoals,
});
