import { useTranslation } from 'react-i18next';
import { ColumnPickerMenu, type DataTableColumn } from '@/components/ui';
import type { DisplayRow } from '@/features/miningTax/groupRows';
import { useColumnVisibility } from '@/lib/columnVisibility';
import { TAX_COLUMN_IDS, useVisibleTaxColumns, type TaxColumnId } from './taxColumns';

export function TaxColumnPicker({ columns }: { columns: readonly DataTableColumn<DisplayRow>[] }) {
  const { t } = useTranslation();
  const { visible, toggle, reset } = useColumnVisibility(useVisibleTaxColumns, TAX_COLUMN_IDS);
  const onOffer = new Set(columns.map((column) => column.id));
  return (
    <ColumnPickerMenu
      available={TAX_COLUMN_IDS.filter((id) => onOffer.has(id))}
      visible={visible}
      columnsById={
        Object.fromEntries(columns.map((column) => [column.id, column])) as Record<
          TaxColumnId,
          DataTableColumn<DisplayRow>
        >
      }
      onToggle={toggle}
      onReset={reset}
      buttonLabel={t('common.columnsButton')}
      menuTitle={t('common.columnsMenuTitle')}
      resetLabel={t('common.resetColumns')}
      size="sm"
    />
  );
}
