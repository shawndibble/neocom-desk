import { useTranslation } from 'react-i18next';
import { MenuItem } from '@/components/ui';

/** "Find BPC in BPC Sourcing" for a known blueprint, as an item-menu entry. */
export function BpcSourcingMenuItem({
  blueprintTypeID,
  onSearch,
}: {
  blueprintTypeID: number;
  onSearch: (blueprintTypeID: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <MenuItem onSelect={() => onSearch(blueprintTypeID)}>
      {t('industry.contextMenu.findBpcInSourcing')}
    </MenuItem>
  );
}
