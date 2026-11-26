import type { DisplayAttribute } from '@/engine/market/itemAttributes';
import type { AttributeSection, ResistLayer } from '@/engine/market/itemAttributeSections';
import { resistReadsDifferently } from '@/features/fittings/stats/resistFormat';
import { formatAttributeValue } from './format';

export function numberText(value: number, unit: string | null): string {
  return `${formatAttributeValue(value, unit)}${unit ? ` ${unit}` : ''}`;
}

export function rowValueText(attribute: DisplayAttribute): string {
  return attribute.displayValue ?? numberText(attribute.value, attribute.unit);
}

export interface SkilledChange {
  base: string;
  skilled: string;
  spoken: { base: string; value: string };
}

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

function layerShowsSkilled(layer: ResistLayer): boolean {
  if (!layer.skilled) return false;
  if (skilledHpChange(layer)) return true;
  const { resonances } = layer.skilled;
  return (Object.keys(resonances) as (keyof typeof resonances)[]).some((key) =>
    resistReadsDifferently(layer.resonances[key], resonances[key])
  );
}

export function sectionsShowSkilled(sections: readonly AttributeSection[]): boolean {
  return sections.some((section) =>
    section.kind === 'group'
      ? section.group.attributes.some((attribute) => skilledChange(attribute) !== null)
      : section.layers.some(layerShowsSkilled)
  );
}
