/**
 * Which System Label folders the Mail list shows, remembered across visits.
 *
 * Silent page state, not a Settings control: the chips are on screen whenever
 * they apply, and a second copy under Settings would be a place that could
 * drift from what the row itself shows — the same call `miningTaxStatusFilter`
 * made.
 *
 * It earns persistence because it *hides mail*, and because that is the whole
 * point of the feature: a pilot who never reads Sent asked to stop seeing it,
 * and a preference that forgets itself every reload has not granted that.
 * The previous in-memory tab memory could get away with being temporary —
 * losing it put you back on All, which hid nothing.
 *
 * **Device-wide, not per character.** The tab it replaces was remembered per
 * character (issue #416); "which folders do I care about" is a habit of the
 * pilot rather than a fact about one of their characters, and one selection
 * that follows you across a character switch is both simpler and what a pilot
 * who flies an alt for one corp job actually wants. The chips are always
 * visible, so a character that needs a different set is one click away.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';
import { MAIL_FOLDERS, parseMailFolders, type MailTab } from '@/engine/mail';

export const MAIL_FOLDERS_SETTING_KEY = 'mailFolders';

/** All four, matching the All tab this replaces — no folder is hidden until the pilot hides it. */
export const DEFAULT_MAIL_FOLDERS: readonly MailTab[] = MAIL_FOLDERS;

export const useMailFolders = createLocalSetting<readonly MailTab[]>({
  key: MAIL_FOLDERS_SETTING_KEY,
  // An array, not a Set: Dexie stores plain structured-cloneable values, and a
  // Set only round-trips as one by accident of the driver. Rebuilt into a Set
  // at the point of use.
  defaultValue: DEFAULT_MAIL_FOLDERS,
  parse: parseMailFolders,
});
