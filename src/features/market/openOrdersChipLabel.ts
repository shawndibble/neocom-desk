import type { activeFilterChips } from './openOrdersFilter';

export function chipLabel(
  chip: ReturnType<typeof activeFilterChips>[number],
  characterNamesById: ReadonlyMap<number, string>,
  locationNamesById: ReadonlyMap<number, string>,
  t: (key: string, options?: Record<string, unknown>) => string
): string {
  const label = t(chip.labelKey);
  if (chip.id === 'text') return `${label}: "${chip.value}"`;
  if (chip.id === 'side')
    return `${label}: ${t(chip.value === 'buy' ? 'orders.buy' : 'orders.sell')}`;
  if (chip.id.startsWith('character:')) {
    const characterId = Number(chip.value);
    return `${label}: ${characterNamesById.get(characterId) ?? chip.value}`;
  }
  if (chip.id.startsWith('location:')) {
    const locationId = Number(chip.value);
    return `${label}: ${locationNamesById.get(locationId) ?? chip.value}`;
  }
  if (chip.id.startsWith('problem:')) return `${label}: ${t(`market.orders.group.${chip.value}`)}`;
  if (chip.id === 'costBasis') {
    return `${label}: ${t(chip.value === 'linked' ? 'market.orders.filter.costBasisLinked' : 'market.orders.filter.costBasisMissing')}`;
  }
  if (chip.value !== undefined) return `${label}: ${chip.value}`;
  return label;
}
