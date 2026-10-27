/**
 * Appraisal's Recent list: the raw paste text of the last few Appraisals, so a
 * pile reloads and re-prices (an EFT fit stays a fit). Device-local, never
 * synced. Pure list handling plus its Dexie-backed setting; no named lists.
 */
import { parseAppraisalPaste } from '@/engine/market/appraisalPaste';
import { createLocalSetting } from '@/lib/useLocalSetting';

export const MAX_RECENT = 5;
const LABEL_NAMES = 2;

export interface RecentAppraisal {
  text: string;
  /** Epoch ms of the Appraise press. */
  savedAt: number;
}

/** Newest first, deduped by exact text (a repeat moves to the front), capped at `MAX_RECENT`. */
export function addRecent(
  list: readonly RecentAppraisal[],
  text: string,
  now: number
): RecentAppraisal[] {
  if (text.trim() === '') return [...list];
  return [{ text, savedAt: now }, ...list.filter((entry) => entry.text !== text)].slice(
    0,
    MAX_RECENT
  );
}

/** The first item names and how many more follow — the caller words it (i18n) and adds the age. */
export function recentLabel(text: string): { names: string[]; more: number } {
  const entries = parseAppraisalPaste(text);
  return {
    names: entries.slice(0, LABEL_NAMES).map((entry) => entry.name),
    more: Math.max(0, entries.length - LABEL_NAMES),
  };
}

export const useRecentAppraisals = createLocalSetting<readonly RecentAppraisal[]>({
  key: 'appraisalRecent',
  defaultValue: [],
  parse: (raw) => {
    if (!Array.isArray(raw)) return null;
    const valid = raw.filter(
      (entry): entry is RecentAppraisal =>
        entry !== null &&
        typeof entry === 'object' &&
        typeof (entry as RecentAppraisal).text === 'string' &&
        typeof (entry as RecentAppraisal).savedAt === 'number'
    );
    return valid.slice(0, MAX_RECENT);
  },
});
