/**
 * The pilot's own **System Notes**: one short plain-text note per solar system,
 * written and read from the Route Safety table.
 *
 * Synced, and one set for the whole account: a system is not a Character's
 * (decision `20261020-*-route-safety-system-notes`). Kept as one synced setting
 * blob, so it needs no new collection, rule or index. The note never feeds
 * routing, rankings or Avoided Systems — Route Safety states conditions, never
 * verdicts (decision `20260912-172628`).
 */
import { createSyncedSetting } from '@/lib/useSyncedSetting';

export const SYSTEM_NOTES_KEY = 'sync.systemNotes';

export const SYSTEM_NOTE_MAX_LENGTH = 500;

export interface SystemNote {
  text: string;
  /** Epoch ms of the last edit, shown beside the note as the pilot's own past observation. */
  updatedAt: number;
}

export type SystemNotes = Record<number, SystemNote>;

/**
 * Anything, keeping only well-formed notes. What comes back from sync was
 * written by another device, possibly another build, so one bad entry is
 * dropped rather than costing the pilot every note.
 */
export function parseSystemNotes(raw: unknown): SystemNotes {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const notes: SystemNotes = {};
  for (const [key, value] of Object.entries(raw)) {
    const id = Number(key);
    if (!Number.isInteger(id) || id <= 0) continue;
    if (typeof value !== 'object' || value === null) continue;
    const { text, updatedAt } = value as Partial<SystemNote>;
    if (typeof text !== 'string' || typeof updatedAt !== 'number' || !Number.isFinite(updatedAt)) {
      continue;
    }
    const trimmed = text.trim().slice(0, SYSTEM_NOTE_MAX_LENGTH);
    if (trimmed === '') continue;
    notes[id] = { text: trimmed, updatedAt };
  }
  return notes;
}

/**
 * The notes with `text` saved for a system: trimmed and capped, stamped with
 * `now`. Empty text deletes the note. Unchanged text returns the same object,
 * so a blur without an edit leaves the date alone.
 */
export function withSystemNote(
  notes: SystemNotes,
  systemId: number,
  text: string,
  now: number
): SystemNotes {
  const next = text.trim().slice(0, SYSTEM_NOTE_MAX_LENGTH);
  const current = notes[systemId];
  if (next === '') {
    if (current === undefined) return notes;
    const rest = { ...notes };
    delete rest[systemId];
    return rest;
  }
  if (current?.text === next) return notes;
  return { ...notes, [systemId]: { text: next, updatedAt: now } };
}

/** The note's first non-empty line, for the indicator's tooltip. */
export function noteFirstLine(text: string): string {
  return (
    text
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line !== '') ?? ''
  );
}

// Never deleted via deleteSyncedSetting: removing the last note writes `{}`, so
// the tombstone-expiry edge does not bite.
export const useSystemNotes = createSyncedSetting<SystemNotes>({
  key: SYSTEM_NOTES_KEY,
  defaultValue: {},
  parse: parseSystemNotes,
});
