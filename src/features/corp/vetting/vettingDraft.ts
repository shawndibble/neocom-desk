/**
 * What an applicant has typed but not sent, kept while they leave for EVE's login to add another
 * character: the answers, the note and the "these are all my characters" tick. `sessionStorage`,
 * keyed by the review id, so it lasts for this tab's round trip and no longer; it is cleared on
 * Send, Start over and withdraw. Every access is guarded, and the page works without it (the
 * pilot then types again).
 */
import { isRecord } from '@/engine/guards';

export interface VettingDraft {
  /** By question id. */
  answers: Record<string, string>;
  note: string;
  allMine: boolean;
}

const PREFIX = 'neocom.vetting.draft.';

/** A stored draft as the page can use it; null for anything that is not one. Pure. */
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

/** Whether there is anything worth keeping. Pure. */
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
  } catch {
    // Without storage the pilot types it again after the login.
  }
}

export function clearVettingDraft(reviewId: string): void {
  try {
    sessionStorage.removeItem(PREFIX + reviewId);
  } catch {
    // Nothing to forget.
  }
}
