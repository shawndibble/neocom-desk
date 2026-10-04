/**
 * ESI's `reason` on a daily goal payout journal line (and its tax line) is
 * not prose: it is the id of the goal's name in the game client's
 * localization table (e.g. `"1004953"` is `UI/DailyGoals/Names/JumpGoal_name`,
 * "Complete 3 Jumps"). ESI and the SDE publish no such table, so the names
 * live in `en.json` under `wallet.dailyGoalNames`, keyed by this id: every
 * `UI/DailyGoals/Names/*` entry of the client's `localization_fsd_en-us.pickle`
 * as of build 3569502 (Oct 2026). A goal CCP adds later reads as "Daily goal"
 * until it is added there.
 */
import type { TFunction } from 'i18next';

const BARE_ID = /^\d+$/;

/** A journal line's daily goal message id, or null when it isn't a daily goal payout. */
export function dailyGoalMessageIdOf(entry: { ref_type: string; reason?: string }): number | null {
  if (!entry.ref_type.startsWith('daily_goal_payouts')) return null;
  const reason = entry.reason?.trim();
  return reason && BARE_ID.test(reason) ? Number(reason) : null;
}

/** A daily goal's name, or null when `wallet.dailyGoalNames` has none for its id. */
export function dailyGoalName(messageId: number, t: TFunction): string | null {
  return t(`wallet.dailyGoalNames.${messageId}`, { defaultValue: '' }) || null;
}

/**
 * The description the journal shows for a line: a daily goal line's goal name
 * (or the plain "Daily goal" label) in place of ESI's `-`, else ESI's own.
 * Search and sort go by this, so they match what is on screen.
 */
export function journalDescriptionText(
  entry: { ref_type: string; description: string; reason?: string },
  t: TFunction
): string {
  const goalId = dailyGoalMessageIdOf(entry);
  if (goalId === null) return entry.description;
  return dailyGoalName(goalId, t) ?? t('wallet.dailyGoal');
}
