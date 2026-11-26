import { readLocal, removeLocal, writeLocal } from '@/lib/safeLocalStorage';

export const PENDING_SCAN_TTL_MS = 30 * 60 * 1000;

const KEY = 'miningSurveyPendingScan';

export function stashPendingScan(text: string, now: number = Date.now()): void {
  writeLocal(KEY, JSON.stringify({ text, at: now }));
}

export function takePendingScan(now: number = Date.now()): string | null {
  const raw = readLocal(KEY);
  if (raw === null) return null;
  removeLocal(KEY);
  try {
    const parsed = JSON.parse(raw) as { text?: unknown; at?: unknown };
    if (typeof parsed.text !== 'string' || typeof parsed.at !== 'number') return null;
    return now - parsed.at <= PENDING_SCAN_TTL_MS ? parsed.text : null;
  } catch {
    return null;
  }
}
