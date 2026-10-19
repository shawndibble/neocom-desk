/** Lines the "no data" tooltip lists before it sums up the rest — a tooltip is no place for a long list. */
const UNKNOWN_ITEMS_SHOWN = 10;

/**
 * The items with no data in this build, one per line — "Name ×2" where the
 * Fitting has several, so the lines add up to the count beside them.
 */
export function unknownItemsList(
  typeIds: readonly number[],
  typeName: (typeId: number) => string,
  t: (key: string, options?: Record<string, unknown>) => string
): string {
  const counts = new Map<number, number>();
  for (const typeId of typeIds) counts.set(typeId, (counts.get(typeId) ?? 0) + 1);
  const lines = [...counts].map(([typeId, count]) =>
    count > 1
      ? t('fittings.stats.unknownItemCount', { name: typeName(typeId), count })
      : typeName(typeId)
  );
  if (lines.length <= UNKNOWN_ITEMS_SHOWN) return lines.join('\n');
  return [
    ...lines.slice(0, UNKNOWN_ITEMS_SHOWN),
    t('fittings.stats.unknownItemsMore', { count: lines.length - UNKNOWN_ITEMS_SHOWN }),
  ].join('\n');
}
