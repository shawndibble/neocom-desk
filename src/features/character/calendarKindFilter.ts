/**
 * Which kinds of clock the Calendar page is hiding, remembered across visits.
 *
 * Silent page state, not a Settings control: the filter's own menu is one tap
 * away whenever it applies, and a second copy on the Settings page would be a
 * place that could drift from what the control itself shows.
 *
 * It earns persistence for the reason the Moon Mining status filter does — it
 * *hides rows*. Forgetting it puts a pilot who works from planets and industry
 * back in front of all six clocks every visit; remembering it means the filter
 * is worth setting once.
 *
 * **It stores what is HIDDEN, not what is shown.** That inversion is the whole
 * design. A stored list of selected kinds would mean any kind added to
 * `CHARACTER_BOARD_ITEM_KINDS` later is absent from every existing pilot's
 * stored array, and would therefore arrive switched *off* — a new source
 * silently invisible to exactly the people who already use the page. Stored as
 * exclusions, a new kind is simply not excluded, so it shows up the day it
 * ships. It also makes an unknown stored value harmless: a kind that was
 * removed since the row was written just filters out.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';
import { CHARACTER_BOARD_ITEM_KINDS, type CharacterBoardItemKind } from '@/engine/character/board';

export const CALENDAR_HIDDEN_KINDS_KEY = 'calendarHiddenKinds';

/** Nothing hidden: a pilot who has never touched the filter sees every clock. */
export const DEFAULT_HIDDEN_KINDS: readonly CharacterBoardItemKind[] = [];

const KNOWN_KINDS = new Set<string>(CHARACTER_BOARD_ITEM_KINDS);

function isKind(raw: unknown): raw is CharacterBoardItemKind {
  return typeof raw === 'string' && KNOWN_KINDS.has(raw);
}

export const useCalendarHiddenKinds = createLocalSetting<readonly CharacterBoardItemKind[]>({
  key: CALENDAR_HIDDEN_KINDS_KEY,
  defaultValue: DEFAULT_HIDDEN_KINDS,
  // An array, not a Set: Dexie stores plain structured-cloneable values, and a
  // Set round-trips as one only by accident of the driver. Rebuilt into a Set
  // at the point of use, by `shownKinds` below.
  //
  // An empty array IS honoured here, unlike the Moon Mining status filter —
  // for this setting empty means "hide nothing", which is the default and the
  // most common state, not a broken one.
  parse: (raw) => {
    if (!Array.isArray(raw)) return null;
    // Unknown entries are dropped rather than rejecting the whole row: a kind
    // deleted since this was written should cost the pilot their one stale
    // exclusion, not their whole filter.
    return [...new Set(raw.filter(isKind))];
  },
});

/**
 * The complement — what the board should actually show.
 *
 * Derived rather than stored, so the two can never disagree, and computed from
 * `CHARACTER_BOARD_ITEM_KINDS` so a newly added kind is shown without anything
 * here changing.
 */
export function shownKinds(hidden: readonly CharacterBoardItemKind[]): Set<CharacterBoardItemKind> {
  const hiddenSet = new Set(hidden);
  return new Set(CHARACTER_BOARD_ITEM_KINDS.filter((kind) => !hiddenSet.has(kind)));
}

/** Flips one kind, for a menu whose items are checkboxes over the shown set. */
export function toggleHiddenKind(
  hidden: readonly CharacterBoardItemKind[],
  kind: CharacterBoardItemKind
): CharacterBoardItemKind[] {
  return hidden.includes(kind) ? hidden.filter((existing) => existing !== kind) : [...hidden, kind];
}
