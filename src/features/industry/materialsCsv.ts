import type { CsvColumn } from '@/lib/csv';
import type { EffectiveMaterial, HubPrices } from '@/engine/industry/types';

type Translate = (key: string) => string;

/**
 * CSV columns for the materials list: name, effective (post-ME) quantity,
 * unit price, line total. Mirrors MaterialsTable's priced predicate exactly
 * — `pricesReady && hubPrices[typeID] !== undefined` — so a material with no
 * hub price, or any material at all when prices failed to load, emits a
 * blank cell (not a display string like "No price") for both price columns.
 * A blank lets a spreadsheet SUM() skip the row; a string would poison the
 * column into text.
 */
export function materialsCsvColumns(
  t: Translate,
  nameFor: (typeID: number) => string,
  hubPrices: HubPrices,
  pricesReady: boolean
): CsvColumn<EffectiveMaterial>[] {
  function unitPrice(material: EffectiveMaterial): number | null {
    const price = hubPrices[material.typeID];
    const priced = pricesReady && price !== undefined;
    return priced ? price : null;
  }

  return [
    {
      header: t('industry.csvMaterial'),
      value: (material) => nameFor(material.typeID),
    },
    {
      header: t('industry.csvQuantity'),
      value: (material) => material.quantity,
    },
    {
      header: t('industry.csvUnitPriceIsk'),
      value: (material) => unitPrice(material),
    },
    {
      header: t('industry.csvLineTotalIsk'),
      value: (material) => {
        const price = unitPrice(material);
        return price === null ? null : price * material.quantity;
      },
    },
  ];
}
