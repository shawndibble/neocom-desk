import { useTranslation } from 'react-i18next';
import { Panel } from '@/components/ui';
import { nameForType, type BlueprintCatalog } from './blueprintCatalog';

interface GroupCraftedPanelProps {
  craftedTypeIds: readonly number[];
  catalog: BlueprintCatalog;
}

/**
 * A material this group's own build tree fully produces (see
 * `useGroupBuyRows`) was never bought at all, so it lives alongside Members
 * rather than inside the buy table — the two panels together are "what this
 * group is made of," split by whether a plan is another member or a material
 * it manufactures directly.
 */
export function GroupCraftedPanel({ craftedTypeIds, catalog }: GroupCraftedPanelProps) {
  const { t } = useTranslation();
  return (
    <Panel title={t('industry.groupCraftedTitle', { count: craftedTypeIds.length })} padded={false}>
      <ul className="divide-y divide-line text-xs">
        {craftedTypeIds.map((typeID) => (
          <li key={typeID} className="flex items-center justify-between gap-2 px-2.5 py-1.5">
            <span className="truncate">{nameForType(catalog, typeID)}</span>
            <span className="shrink-0 text-[0.6875rem] font-semibold tracking-widest text-success uppercase">
              {t('industry.groupCraftedTag')}
            </span>
          </li>
        ))}
      </ul>
      <p className="p-2.5 text-[0.6875rem] text-text-dim">{t('industry.groupCraftedHint')}</p>
    </Panel>
  );
}
