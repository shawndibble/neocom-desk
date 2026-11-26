import {
  nameSurvey,
  parseSurveyHistory,
  recordSurvey,
  type SurveyHistoryEntry,
} from '@/engine/survey/history';
import { createSyncedSetting } from '@/lib/useSyncedSetting';

export const SYNCED_SURVEY_HISTORY_KEY = 'sync.surveyHistory';

export const useSurveyHistory = createSyncedSetting<SurveyHistoryEntry[]>({
  key: SYNCED_SURVEY_HISTORY_KEY,
  defaultValue: [],
  parse: (raw) => parseSurveyHistory(raw, Date.now()),
});

export async function noteSurvey(id: string): Promise<void> {
  if (!useSurveyHistory.getState().hydrated) await useSurveyHistory.getState().hydrate();
  const { value, setValue } = useSurveyHistory.getState();
  if (value.some((entry) => entry.id === id)) return;
  await setValue(recordSurvey(value, id, Date.now()));
}

export async function renameSurvey(id: string, name: string): Promise<void> {
  if (!useSurveyHistory.getState().hydrated) await useSurveyHistory.getState().hydrate();
  const { value, setValue } = useSurveyHistory.getState();
  const next = nameSurvey(value, id, name);
  if (next !== value) await setValue([...next]);
}

export async function forgetSurvey(id: string): Promise<void> {
  const { value, setValue } = useSurveyHistory.getState();
  if (value.some((entry) => entry.id === id)) {
    await setValue(value.filter((entry) => entry.id !== id));
  }
}
