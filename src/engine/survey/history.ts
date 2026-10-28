/**
 * The Surveys a pilot has created or opened in the app, as a short list of
 * Share Link ids, each with the name the pilot gave it, if any. Only ids and
 * names are kept (a Survey's content stays in its Share Link), and a link lives
 * 7 days, so an entry older than that is dead. Pure.
 */
import { isShareId } from '../share/shareId';

export interface SurveyHistoryEntry {
  id: string;
  /** When the pilot first created or opened it, epoch ms. */
  addedAt: number;
  /** The pilot's own name for it, shown only to them; absent when unnamed. */
  name?: string;
}

/** A Share Link's life: nothing older is worth listing. */
export const HISTORY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
/** The list keeps the newest 8 by `addedAt`; older ones fall off the list only. */
export const HISTORY_MAX = 8;
/** A name is a short label, not a note. */
export const SURVEY_NAME_MAX = 40;

/** Trimmed and capped; `undefined` when there is nothing left to show. */
function cleanName(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const name = raw.trim().slice(0, SURVEY_NAME_MAX).trim();
  return name === '' ? undefined : name;
}

/** The entry with `name` set, or with no `name` key at all when it is blank. */
function withName(entry: SurveyHistoryEntry, raw: unknown): SurveyHistoryEntry {
  const name = cleanName(raw);
  return name === undefined
    ? { id: entry.id, addedAt: entry.addedAt }
    : { id: entry.id, addedAt: entry.addedAt, name };
}

/** Drops dead entries, keeps one per id (the latest), newest first, capped. */
function tidy(entries: readonly SurveyHistoryEntry[], now: number): SurveyHistoryEntry[] {
  const latest = new Map<string, SurveyHistoryEntry>();
  for (const entry of entries) {
    if (now - entry.addedAt > HISTORY_WINDOW_MS) continue;
    const seen = latest.get(entry.id);
    if (seen === undefined || entry.addedAt > seen.addedAt) latest.set(entry.id, entry);
  }
  return [...latest.values()].sort((a, b) => b.addedAt - a.addedAt).slice(0, HISTORY_MAX);
}

/** A stored or synced list, which another device or build may have written. */
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

/**
 * The list after the pilot creates or opens `id`. A survey already listed keeps
 * its first time: reopening it must not renew a link that is expiring.
 */
export function recordSurvey(
  list: readonly SurveyHistoryEntry[],
  id: string,
  now: number
): SurveyHistoryEntry[] {
  const known = list.find((entry) => entry.id === id);
  // First in the input, so a tie on the millisecond (two surveys opened back to
  // back) still lists the new one first: the sort in `tidy` is stable.
  return tidy([known ?? { id, addedAt: now }, ...list.filter((entry) => entry.id !== id)], now);
}

/** The list with `id` given `name`; a blank name removes it. Order is unchanged. */
export function nameSurvey(
  list: readonly SurveyHistoryEntry[],
  id: string,
  name: string
): readonly SurveyHistoryEntry[] {
  if (!list.some((entry) => entry.id === id)) return list;
  return list.map((entry) => (entry.id === id ? withName(entry, name) : entry));
}
