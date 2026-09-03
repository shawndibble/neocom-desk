/**
 * Shared formatting for a remap's attribute spread — one line, highest
 * attribute first. Used by the tools pane's segment list (PlanEditor) and by
 * a Remap Marker row that knows its own target attributes (EntryList).
 */
import { ATTRIBUTE_NAMES } from '@/engine/optimizer';
import type { AttributeName, Attributes } from '@/engine/types';

/** "PER": the house three-letter attribute code, as EntryList's pair badge writes it. */
export function attributeShort(name: AttributeName): string {
  return name.slice(0, 3).toUpperCase();
}

/** "PER 27 / WIL 21 / INT 17 / …": full remap spread, highest first. */
export function remapInstruction(attributes: Attributes): string {
  return [...ATTRIBUTE_NAMES]
    .sort((a, b) => attributes[b] - attributes[a])
    .map((name) => `${attributeShort(name)} ${attributes[name]}`)
    .join(' / ');
}
