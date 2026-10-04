/**
 * Device-local choices behind the "Continue the <date> session" offer
 * (scope decision 20261004). Local, not synced, like the rest of this page's
 * viewing choices: auto mode is about how this device's owner wants to be
 * asked, and a dismissed offer is a decision about one day's entry that is
 * harmless to see again on another device.
 *
 * Neither is a view preference ("Reset saved view preferences" leaves both
 * alone): auto mode is a deliberate opt-in that writes Assignments, and a
 * dismissal is the pilot's answer to a question, not a remembered sort.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';

/** On: a qualifying next-day entry is continued without asking, with an Undo. */
export const useAutoContinueSessions = createLocalSetting<boolean>({
  key: 'miningTaxAutoContinue',
  defaultValue: false,
  parse: (raw) => (typeof raw === 'boolean' ? raw : null),
});

/** Display-row keys of entries the pilot chose to "Keep separate" — never offered again. */
export const useDismissedContinuations = createLocalSetting<string[]>({
  key: 'miningTaxDismissedContinuations',
  defaultValue: [],
  parse: (raw) => (Array.isArray(raw) && raw.every((key) => typeof key === 'string') ? raw : null),
});
