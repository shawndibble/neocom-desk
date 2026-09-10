/**
 * Estimates one Character's rendered section height for the Notifications
 * panel's virtualizer (issue #740): the panel virtualizes at Character
 * granularity — one virtualized row per Character, each rendering its full
 * existing section unchanged — so a ~50-Character roster with several
 * expanded mounts only the sections actually on screen, rather than every
 * one of their ~90 checkboxes at once regardless of how many Characters are
 * expanded. Reuses `@tanstack/react-virtual`, the same library `Assets.tsx`
 * uses for a comparable large-list case, with the same fixed-estimate
 * approach (no `measureElement`) rather than the "several list shapes
 * reduced to one row union" pattern that case uses — the events-per-Character
 * list itself doesn't need its own row, since only the *Character* axis is
 * where a real roster gets large (50 Characters vs. a fixed ~19-event
 * catalog).
 *
 * Internally this still walks the exact same conditional rows the old inline
 * JSX rendered (one per visible event, plus whatever threshold/hint/eve-type
 * rows that event attaches) — not to render them, but because that walk is
 * the one place that already knows how many rows, and of what kind, a given
 * Character's expanded content actually produces.
 */
import { NOTIFICATION_FAMILIES, eveTypesByFamily } from './eventSelection';
import { isCorpEventId, type NotificationEventId } from './events';

export interface CharacterSectionHeightInput {
  expanded: boolean;
  /** Ids to show for this Character — narrowed by search, else every catalog id. */
  visibleEventIds: readonly NotificationEventId[];
  /** True once this Character both holds the event's scope and its corp capability, if any. */
  rowEnabledFor: (eventId: NotificationEventId) => boolean;
  /** Whether this Character holds `eveNotification`'s own scope (family/type rows gate on this alone, never capability). */
  hasEveNotificationScope: boolean;
}

type InternalRowKind =
  | 'character-header'
  | 'column-captions'
  | 'event'
  | 'extractor-hint'
  | 'extractor-lead-time'
  | 'fuel-threshold'
  | 'wallet-threshold'
  | 'corp-wallet-threshold'
  | 'corp-best-effort-hint'
  | 'eve-types-hint'
  | 'eve-family-header'
  | 'eve-type';

/**
 * Same fixed per-kind estimates `Assets.tsx`'s `estimateRowHeight` uses,
 * sized to this panel's rows instead. The three hint rows carry a full
 * sentence of prose (e.g. `extractorExpiringHint`), not a compact caption —
 * sized to wrap two lines rather than one, since there's no `measureElement`
 * here to correct an under-estimate later.
 */
const ROW_HEIGHT: Record<InternalRowKind, number> = {
  'character-header': 32,
  'column-captions': 26,
  event: 33,
  'extractor-hint': 48,
  'extractor-lead-time': 44,
  'fuel-threshold': 52,
  'wallet-threshold': 52,
  'corp-wallet-threshold': 44,
  'corp-best-effort-hint': 42,
  'eve-types-hint': 42,
  'eve-family-header': 30,
  'eve-type': 33,
};

/**
 * One Character's estimated section height: the header row, plus — while
 * expanded — column captions, one row per visible event, and whatever
 * inline disclosure/threshold/eve-type rows that event carries. Same
 * conditions the old inline JSX used to decide what to render.
 */
export function estimateCharacterSectionHeight(input: CharacterSectionHeightInput): number {
  let height = ROW_HEIGHT['character-header'];
  if (!input.expanded) return height;

  height += ROW_HEIGHT['column-captions'];

  for (const eventId of input.visibleEventIds) {
    height += ROW_HEIGHT.event;
    const rowEnabled = input.rowEnabledFor(eventId);

    if (eventId === 'planetaryExtractorExpiring') height += ROW_HEIGHT['extractor-hint'];
    if (eventId === 'planetaryExtractorExpiring' && rowEnabled) {
      height += ROW_HEIGHT['extractor-lead-time'];
    }
    if (eventId === 'structureFuelLow' && rowEnabled) height += ROW_HEIGHT['fuel-threshold'];
    if (eventId === 'walletBalanceChanged' && rowEnabled) height += ROW_HEIGHT['wallet-threshold'];
    if (eventId === 'corpWalletThreshold' && rowEnabled) {
      height += ROW_HEIGHT['corp-wallet-threshold'];
    }
    if (isCorpEventId(eventId)) height += ROW_HEIGHT['corp-best-effort-hint'];

    if (eventId === 'eveNotification' && input.hasEveNotificationScope) {
      height += ROW_HEIGHT['eve-types-hint'];
      for (const family of NOTIFICATION_FAMILIES) {
        const types = eveTypesByFamily(family);
        if (types.length === 0) continue;
        height += ROW_HEIGHT['eve-family-header'] + types.length * ROW_HEIGHT['eve-type'];
      }
    }
  }

  return height;
}
