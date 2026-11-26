import { isRecord } from '@/engine/guards';

export interface VettingDraft {
  answers: Record<string, string>;
  note: string;
  allMine: boolean;
}

const PREFIX = 'neocom.vetting.draft.';

export function parseVettingDraft(raw: string | null): VettingDraft | null {
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (
    !isRecord(parsed) ||
    !isRecord(parsed.answers) ||
    typeof parsed.note !== 'string' ||
    typeof parsed.allMine !== 'boolean'
  ) {
    return null;
  }
  const answers: Record<string, string> = {};
  for (const [id, answer] of Object.entries(parsed.answers)) {
    if (typeof answer === 'string') answers[id] = answer;
  }
  return { answers, note: parsed.note, allMine: parsed.allMine };
}

export function isBlankVettingDraft(draft: VettingDraft): boolean {
  return !draft.allMine && draft.note === '' && Object.values(draft.answers).every((a) => a === '');
}

export function readVettingDraft(reviewId: string): VettingDraft | null {
  try {
    return parseVettingDraft(sessionStorage.getItem(PREFIX + reviewId));
  } catch {
    return null;
  }
}

export function writeVettingDraft(reviewId: string, draft: VettingDraft): void {
  try {
    if (isBlankVettingDraft(draft)) sessionStorage.removeItem(PREFIX + reviewId);
    else sessionStorage.setItem(PREFIX + reviewId, JSON.stringify(draft));
  } catch {}
}

export function clearVettingDraft(reviewId: string): void {
  try {
    sessionStorage.removeItem(PREFIX + reviewId);
  } catch {}
}
