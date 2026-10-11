/**
 * Which Overview cards the pilot has switched off from the board's edit menu.
 *
 * Stored as the *hidden* keys rather than the shown ones, so a card added in
 * a later build shows by default instead of arriving pre-hidden.
 *
 * Synced, and one list for the whole account rather than one per Character:
 * "I don't do mining tax" is a fact about the pilot, not about one machine or
 * one alt, and re-hiding the same card on every device and every Character
 * is the chore this exists to remove.
 */
import { createSyncedSetting } from '@/lib/useSyncedSetting';

export const OVERVIEW_HIDDEN_CARDS_KEY = 'sync.overviewHiddenCards';

/** Every card the board can hide, in the order the edit menu lists them. */
export const OVERVIEW_CARD_KEYS = [
  'orders',
  'mining',
  'contracts',
  'planetary',
  'industry',
  'structures',
  'moonChunks',
  'comingUp',
  'spExtraction',
  'mail',
  'priceAlerts',
  'incursions',
  'alerts',
] as const;

export type OverviewCardKey = (typeof OVERVIEW_CARD_KEYS)[number];

/**
 * Each card's name, as its own header and the edit menu both print it — one
 * table, so the menu cannot drift from the card it switches.
 */
export const OVERVIEW_CARD_LABEL: Record<OverviewCardKey, string> = {
  orders: 'overview.board.orders',
  mining: 'overview.board.miningTax',
  contracts: 'overview.board.contracts',
  planetary: 'overview.board.planetary',
  industry: 'overview.board.industry',
  structures: 'overview.board.structures',
  moonChunks: 'overview.board.moonChunks',
  comingUp: 'overview.board.comingUp',
  spExtraction: 'overview.board.spExtraction',
  mail: 'overview.board.mail',
  priceAlerts: 'overview.board.priceAlerts',
  incursions: 'overview.board.incursions',
  alerts: 'overview.board.alerts',
};

/**
 * Any list of strings, deduped — including keys this build has no card for.
 * The value merges last-write-wins as a whole, so a build that dropped a key
 * it did not recognise would write the shortened list back on its next
 * toggle and un-hide a newer build's card on every device.
 */
export function parseHiddenCards(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  return [...new Set(raw.filter((key): key is string => typeof key === 'string'))];
}

/**
 * Cards that start switched off: an opt-in for pilots who want them, not a
 * card everyone has to hide (Incursions, issue #3541). The list still holds
 * *hidden* keys for every other card, so for these the pilot's "on" is stored
 * as a `show:<key>` marker instead — a plain key already means "hidden", and
 * the marker survives an older build the same way any unknown key does.
 */
export const OVERVIEW_DEFAULT_OFF_CARDS: readonly OverviewCardKey[] = ['incursions'];

const shownMarker = (key: OverviewCardKey) => `show:${key}`;
const isDefaultOff = (key: OverviewCardKey) => OVERVIEW_DEFAULT_OFF_CARDS.includes(key);

export function toggleHiddenCard(hidden: readonly string[], key: OverviewCardKey): string[] {
  const entry = isDefaultOff(key) ? shownMarker(key) : key;
  return hidden.includes(entry) ? hidden.filter((k) => k !== entry) : [...hidden, entry];
}

export function isCardShown(hidden: readonly string[], key: OverviewCardKey): boolean {
  return isDefaultOff(key) ? hidden.includes(shownMarker(key)) : !hidden.includes(key);
}

/** "Show all cards": every card on, the off-by-default ones included. */
export function showAllCards(): string[] {
  return OVERVIEW_DEFAULT_OFF_CARDS.map(shownMarker);
}

export const useOverviewHiddenCards = createSyncedSetting<string[]>({
  key: OVERVIEW_HIDDEN_CARDS_KEY,
  defaultValue: [],
  parse: parseHiddenCards,
});
