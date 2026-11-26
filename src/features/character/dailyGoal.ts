import type { Translate } from '@/lib/translate';

const BARE_ID = /^\d+$/;

export function dailyGoalMessageIdOf(entry: { ref_type: string; reason?: string }): number | null {
  if (!entry.ref_type.startsWith('daily_goal_payouts')) return null;
  const reason = entry.reason?.trim();
  return reason && BARE_ID.test(reason) ? Number(reason) : null;
}

export function dailyGoalName(messageId: number, t: Translate): string | null {
  return t(`wallet.dailyGoalNames.${messageId}`, { defaultValue: '' }) || null;
}

export function journalDescriptionText(
  entry: { ref_type: string; description: string; reason?: string },
  t: Translate
): string {
  const goalId = dailyGoalMessageIdOf(entry);
  if (goalId === null) return entry.description;
  return dailyGoalName(goalId, t) ?? t('wallet.dailyGoal');
}
