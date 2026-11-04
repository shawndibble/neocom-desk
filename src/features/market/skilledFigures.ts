/**
 * Item Detail's "base → skilled" figures as text (§6c): when a row, a resist
 * layer's HP or a resist cell reads differently with the pilot's skills, and
 * whether any of them does — the note above the sections says what the arrows
 * mean only then. Formatting only; `ItemAttributeSections` draws them.
 */
import type { DisplayAttribute } from '@/engine/market/itemAttributes';
import type { AttributeSection, ResistLayer } from '@/engine/market/itemAttributeSections';
import { resistReadsDifferently } from '@/features/fittings/stats/resistFormat';
import { formatAttributeValue } from './format';

/** `value` as an attribute row shows it: the number and its unit. */
function numberText(value: number, unit: string | null): string {
  return `${formatAttributeValue(value, unit)}${unit ? ` ${unit}` : ''}`;
}

/** An attribute row's value as text: its resolved name, or the number and its unit. */
export function rowValueText(attribute: DisplayAttribute): string {
  return attribute.displayValue ?? numberText(attribute.value, attribute.unit);
}

export interface SkilledChange {
  /** The base number, dim before the arrow. */
  base: string;
  /** The pilot's value with its unit. */
  skilled: string;
  /** What a screen reader hears in place of the arrow. */
  spoken: { base: string; value: string };
}

/**
 * A row's "base → skilled" figures, or null when the pilot doesn't change it
 * or the two read the same once formatted (no arrow for an invisible change).
 */
export function skilledChange(attribute: DisplayAttribute): SkilledChange | null {
  if (attribute.skilledValue === undefined || attribute.displayValue !== undefined) return null;
  const skilled = numberText(attribute.skilledValue, attribute.unit);
  if (numberText(attribute.value, attribute.unit) === skilled) return null;
  return {
    base: formatAttributeValue(attribute.value, attribute.unit),
    skilled,
    spoken: { base: rowValueText(attribute), value: skilled },
  };
}

/** A resist layer's HP "base → skilled", or null when the pilot leaves it reading the same. */
export function skilledHpChange(layer: ResistLayer): SkilledChange | null {
  const skilledHp = layer.skilled?.hp ?? null;
  if (layer.hp === null || skilledHp === null) return null;
  const base = formatAttributeValue(layer.hp);
  const value = formatAttributeValue(skilledHp);
  if (base === value) return null;
  return {
    base,
    skilled: `${value} HP`,
    spoken: { base: `${base} HP`, value: `${value} HP` },
  };
}

/** Whether a layer's grid shows any arrow: its HP, or a resist that prints differently. */
function layerShowsSkilled(layer: ResistLayer): boolean {
  if (!layer.skilled) return false;
  if (skilledHpChange(layer)) return true;
  const { resonances } = layer.skilled;
  return (Object.keys(resonances) as (keyof typeof resonances)[]).some((key) =>
    resistReadsDifferently(layer.resonances[key], resonances[key])
  );
}

/** Whether any row or grid cell in `sections` reads "base → skilled" — the note above them says what the arrows mean. */
export function sectionsShowSkilled(sections: readonly AttributeSection[]): boolean {
  return sections.some((section) =>
    section.kind === 'group'
      ? section.group.attributes.some((attribute) => skilledChange(attribute) !== null)
      : section.layers.some(layerShowsSkilled)
  );
}
