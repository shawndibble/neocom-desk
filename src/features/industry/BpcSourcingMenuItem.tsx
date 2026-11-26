import { useTranslation } from 'react-i18next';
import { MenuItem } from '@/components/ui';

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
