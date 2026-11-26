import { displayAttributeValue } from '@/engine/fittings/attributeUnits';
import type { AttributeDictionaryEntry } from '@/sde/marketTypes';

export function formatAttributeNumber(value: number): string {
  return Number(value.toPrecision(4)).toString();
}

export function attributeValueText(value: number, entry: AttributeDictionaryEntry): string {
  const display = displayAttributeValue(value, entry.unitId, entry.unit);
  return `${formatAttributeNumber(display.value)}${display.unit ? ` ${display.unit}` : ''}`;
}
