/**
 * The topic an alert group's row is filed under: the glyph and the eyebrow word
 * (docs/design/alerts-panel-ux-research.md §3c).
 *
 * Reuses the chip bar's own mapping (`typeChipOfGroupKey`) so the chips and the
 * row glyphs name the same thing. That mapping returns null for a group that has
 * no chip — an EVE notification outside the structure prefixes, an event missing
 * from its table — and a row with no topic cue is the problem the glyph exists to
 * fix, so those fall back to `other` rather than going unmarked.
 *
 * Pure: no fetch/DOM/Dexie.
 */
import { typeChipOfGroupKey } from './dangerAlert';

export type AlertTopic = NonNullable<ReturnType<typeof typeChipOfGroupKey>> | 'other';

export function alertTopic(groupKey: string): AlertTopic {
  return typeChipOfGroupKey(groupKey) ?? 'other';
}
