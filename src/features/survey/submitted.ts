/**
 * Has this device ever added a Survey Scan? A pilot who has pasted one before
 * has shown their scanner window is set up right, so the "are all sections
 * expanded?" check (`ExpandedCheck`) only asks the first time. Local, not
 * synced, and per device: an anonymous visitor on a shared page has no account
 * to remember it on.
 */
import { readLocal, writeLocal } from '@/lib/safeLocalStorage';

const KEY = 'miningSurveySubmitted';

export function hasSubmittedScan(): boolean {
  return readLocal(KEY) === '1';
}

export function noteSubmittedScan(): void {
  // Best-effort: if blocked, the pilot is asked once more.
  writeLocal(KEY, '1');
}
