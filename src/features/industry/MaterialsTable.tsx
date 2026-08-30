import { useTranslation } from 'react-i18next';
import type { EffectiveMaterial, HubPrices } from '@/engine/industry/types';
import { formatIsk } from '@/lib/isk';

interface MaterialsTableProps {
  materials: readonly EffectiveMaterial[];
  nameFor: (typeID: number) => string;
  hubPrices: HubPrices;
  /** False when prices couldn't be fetched at all (offline) — hides price/total columns entirely. */
  pricesReady: boolean;
}

/** Materials table: name, effective quantity, unit price, line total. Unpriced rows are flagged. */
export function MaterialsTable({
  materials,
  nameFor,
  hubPrices,
  pricesReady,
}: MaterialsTableProps) {
  const { t } = useTranslation();

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-line text-[11px] tracking-widest text-text-dim uppercase">
            <th className="py-1 pr-2 font-semibold">{t('industry.material')}</th>
            <th className="py-1 pr-2 text-right font-semibold">{t('industry.quantity')}</th>
            <th className="py-1 pr-2 text-right font-semibold">{t('industry.unitPrice')}</th>
            <th className="py-1 text-right font-semibold">{t('industry.lineTotal')}</th>
          </tr>
        </thead>
        <tbody>
          {materials.map((material) => {
            const unitPrice = hubPrices[material.typeID];
            const priced = pricesReady && unitPrice !== undefined;
            return (
              <tr key={material.typeID} className="border-b border-line last:border-b-0">
                <td className="py-1 pr-2">{nameFor(material.typeID)}</td>
                <td className="py-1 pr-2 text-right tabular-nums">
                  {material.quantity.toLocaleString()}
                </td>
                <td className="py-1 pr-2 text-right tabular-nums">
                  {priced ? (
                    formatIsk(unitPrice)
                  ) : (
                    <span className="text-warning">{t('industry.unpriced')}</span>
                  )}
                </td>
                <td className="py-1 text-right tabular-nums">
                  {priced ? formatIsk(unitPrice * material.quantity) : t('common.unknown')}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
