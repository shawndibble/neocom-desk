import { DAY_MS } from '@/lib/age';
import { isShareId } from '../share/shareId';

export interface SurveyHistoryEntry {
  id: string;
  addedAt: number;
  name?: string;
}

export const HISTORY_WINDOW_MS = 7 * DAY_MS;
export const HISTORY_MAX = 8;
export const SURVEY_NAME_MAX = 40;

function cleanName(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const name = raw.trim().slice(0, SURVEY_NAME_MAX).trim();
  return name === '' ? undefined : name;
}

function withName(entry: SurveyHistoryEntry, raw: unknown): SurveyHistoryEntry {
  const name = cleanName(raw);
  return name === undefined
    ? { id: entry.id, addedAt: entry.addedAt }
    : { id: entry.id, addedAt: entry.addedAt, name };
}

function tidy(entries: readonly SurveyHistoryEntry[], now: number): SurveyHistoryEntry[] {
  const latest = new Map<string, SurveyHistoryEntry>();
  for (const entry of entries) {
    if (now - entry.addedAt > HISTORY_WINDOW_MS) continue;
    const seen = latest.get(entry.id);
    if (seen === undefined || entry.addedAt > seen.addedAt) latest.set(entry.id, entry);
  }
  return [...latest.values()].sort((a, b) => b.addedAt - a.addedAt).slice(0, HISTORY_MAX);
}

export function parseSurveyHistory(raw: unknown, now: number): SurveyHistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  const entries: SurveyHistoryEntry[] = [];
  for (const item of raw as unknown[]) {
    if (typeof item !== 'object' || item === null) continue;
    const { id, addedAt, name } = item as { id?: unknown; addedAt?: unknown; name?: unknown };
    if (typeof id !== 'string' || !isShareId(id)) continue;
    if (typeof addedAt !== 'number' || !Number.isFinite(addedAt)) continue;
    entries.push(withName({ id, addedAt }, name));
  }
  return tidy(entries, now);
}

export function recordSurvey(
  list: readonly SurveyHistoryEntry[],
  id: string,
  now: number
): SurveyHistoryEntry[] {
  const known = list.find((entry) => entry.id === id);
  return tidy([known ?? { id, addedAt: now }, ...list.filter((entry) => entry.id !== id)], now);
}

export function nameSurvey(
  list: readonly SurveyHistoryEntry[],
  id: string,
  name: string
): readonly SurveyHistoryEntry[] {
  if (!list.some((entry) => entry.id === id)) return list;
  return list.map((entry) => (entry.id === id ? withName(entry, name) : entry));
}
