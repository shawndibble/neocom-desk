import { createSyncedSetting } from '@/lib/useSyncedSetting';

export const SYSTEM_NOTES_KEY = 'sync.systemNotes';

export const SYSTEM_NOTE_MAX_LENGTH = 500;

export interface SystemNote {
  text: string;
  updatedAt: number;
}

export type SystemNotes = Record<number, SystemNote>;

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

export function noteFirstLine(text: string): string {
  return (
    text
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line !== '') ?? ''
  );
}

export const useSystemNotes = createSyncedSetting<SystemNotes>({
  key: SYSTEM_NOTES_KEY,
  defaultValue: {},
  parse: parseSystemNotes,
});
