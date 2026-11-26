import { useMemo, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { ColumnPickerMenu, type DataTableColumn } from '@/components/ui';
import { useColumnVisibility } from '@/lib/columnVisibility';
import type { LocalSettingStore } from '@/lib/useLocalSetting';

export function ProductionColumnPicker<Id extends string, Row>({
  store,
  ids,
  columns,
  size,
}: {
  store: LocalSettingStore<readonly Id[]>;
  ids: readonly Id[];
  columns: readonly DataTableColumn<Row>[];
  size?: ComponentProps<typeof ColumnPickerMenu>['size'];
}) {
  const { t } = useTranslation();
  const { visible, toggle, reset } = useColumnVisibility(store, ids);
  const columnsById = useMemo(
    () =>
      Object.fromEntries(columns.map((column) => [column.id, column])) as Record<
        Id,
        DataTableColumn<Row>
      >,
    [columns]
  );
  return (
    <ColumnPickerMenu
      available={ids}
      visible={visible}
      columnsById={columnsById}
      onToggle={toggle}
      onReset={reset}
      size={size}
      buttonLabel={t('common.columnsButton')}
      menuTitle={t('common.columnsMenuTitle')}
      resetLabel={t('common.resetColumns')}
    />
  );
}
