/**
 * Has this device ever added a Survey Scan? A pilot who has pasted one before
 * has shown their scanner window is set up right, so the "are all sections
 * expanded?" check (`ExpandedCheck`) only asks the first time. Local, not
 * synced, and per device: an anonymous visitor on a shared page has no account
 * to remember it on.
 */
const KEY = 'miningSurveySubmitted';

export function hasSubmittedScan(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function noteSubmittedScan(): void {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    // Best-effort: the pilot is asked once more.
  }
}
