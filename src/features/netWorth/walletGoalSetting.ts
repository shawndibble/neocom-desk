/**
 * The Balance tab's wallet Goal: one name and an ISK target, per device. Not
 * synced; a cleared goal is `null`.
 */
import { GOAL_MAX_TARGET } from '@/engine/netWorth/waiting';
import { createLocalSetting } from '@/lib/useLocalSetting';

export interface WalletGoal {
  name: string;
  target: number;
}

export const useWalletGoal = createLocalSetting<WalletGoal | null>({
  key: 'walletGoal',
  defaultValue: null,
  parse: (raw) => {
    if (raw === null) return null;
    if (typeof raw !== 'object' || Array.isArray(raw)) return null;
    const { name, target } = raw as Record<string, unknown>;
    return typeof name === 'string' &&
      typeof target === 'number' &&
      target > 0 &&
      target <= GOAL_MAX_TARGET
      ? { name, target }
      : null;
  },
});
