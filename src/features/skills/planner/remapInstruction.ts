/**
 * Shared formatting for a remap's attribute spread — one line, highest
 * attribute first. Used by the tools pane's segment list (PlanEditor) and by
 * a Remap Marker row that knows its own target attributes (EntryList).
 */
import { ATTRIBUTE_NAMES } from '@/engine/optimizer';
import type { AttributeName, Attributes, Implants } from '@/engine/types';

/** "PER": the house three-letter attribute code, as EntryList's pair badge writes it. */
export function attributeShort(name: AttributeName): string {
  return name.slice(0, 3).toUpperCase();
}

/**
 * "PER 31 / WIL 25 / INT 21 / …": full remap spread, highest first.
 *
 * The numbers are **implanted** values — base allocation plus the plan's
 * implant lens (What-If Implants, which defaults to the clone's real set) —
 * because that is what EVE's own remap screen shows. A line of bare base
 * values would not match anything the player can read in game, and the point
 * of this string is to be copied across to that screen.
 *
 * Base and implanted values sort differently whenever the hardwirings are
 * uneven (+5 INT and nothing in PER reorders the pair), and the order here
 * follows the implanted values, for the same reason: it has to read like the
 * in-game screen. Values can therefore reach 32, above the 27 ceiling a legal
 * allocation stops at — the stored marker attributes remain base-only, and
 * this is display, not a sheet anything is costed against.
 */
export function remapInstruction(attributes: Attributes, implants: Implants = {}): string {
  const withImplants = (name: AttributeName): number => attributes[name] + (implants[name] ?? 0);
  return [...ATTRIBUTE_NAMES]
    .sort((a, b) => withImplants(b) - withImplants(a))
    .map((name) => `${attributeShort(name)} ${withImplants(name)}`)
    .join(' / ');
}
