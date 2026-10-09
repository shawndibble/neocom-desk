/**
 * The Surveys this pilot has created or opened in the app, as a synced list of
 * Share Link ids (`engine/survey/history.ts`). Synced so a second device can
 * list and reopen them; only ids go up, never a Survey's content, so Firebase
 * gains no second copy of a Survey. Dead links drop out when the picker loads
 * their labels and finds them gone.
 */
import { parseSurveyHistory, recordSurvey, type SurveyHistoryEntry } from '@/engine/survey/history';
import { createSyncedSetting } from '@/lib/useSyncedSetting';

export const SYNCED_SURVEY_HISTORY_KEY = 'sync.surveyHistory';

export const useSurveyHistory = createSyncedSetting<SurveyHistoryEntry[]>({
  key: SYNCED_SURVEY_HISTORY_KEY,
  defaultValue: [],
  parse: (raw) => parseSurveyHistory(raw, Date.now()),
});

/** Notes that the pilot created or opened this Survey. Safe to call on every visit. */
export async function noteSurvey(id: string): Promise<void> {
  if (!useSurveyHistory.getState().hydrated) await useSurveyHistory.getState().hydrate();
  const { value, setValue } = useSurveyHistory.getState();
  if (value.some((entry) => entry.id === id)) return;
  await setValue(recordSurvey(value, id, Date.now()));
}

/** Drops a Survey whose link was found gone. */
export async function forgetSurvey(id: string): Promise<void> {
  const { value, setValue } = useSurveyHistory.getState();
  if (value.some((entry) => entry.id === id)) {
    await setValue(value.filter((entry) => entry.id !== id));
  }
}
