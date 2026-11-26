import { useTranslation } from 'react-i18next';
import { Button, Checkbox, DataAgeBadge, IconButton, LiveStatus, Tooltip } from '@/components/ui';
import { cx } from '@/lib/cx';
import { touchCheckboxLabelClassName } from '@/components/ui/controlStyles';
import * as Icon from '@/components/ui/icons';
import { TableActionsMenu } from '@/components/ui/TableExport';
import type { UseTableExport } from '@/components/ui/useTableExport';
import type { MaterialTableRow } from './subBuildPlan';
import type { useShoppingListCopy } from './useShoppingListCopy';

interface PlanMaterialsActionsProps {
  fetchedAt: Date | null;
  copyState: ReturnType<typeof useShoppingListCopy>['copyState'];
  copyDisabled: boolean;
  onCopy: () => void;
  compressedGas?: { checked: boolean; onChange: (checked: boolean) => void };
  showExport: boolean;
  materialsExport: UseTableExport<MaterialTableRow>;
  onRefresh: () => void;
}

export function PlanMaterialsActions({
  fetchedAt,
  copyState,
  copyDisabled,
  onCopy,
  compressedGas,
  showExport,
  materialsExport,
  onRefresh,
}: PlanMaterialsActionsProps) {
  const { t } = useTranslation();
  return (
    <span className="flex flex-wrap items-center gap-2 text-[0.6875rem] text-text-dim">
      {fetchedAt && <DataAgeBadge date={fetchedAt} />}
      <LiveStatus>
        {copyState === 'copied'
          ? t('industry.copyShoppingListDone')
          : copyState === 'failed'
            ? t('industry.copyShoppingListFailed')
            : null}
      </LiveStatus>
      {compressedGas && (
        <label className={cx(touchCheckboxLabelClassName, 'gap-1.5 text-xs text-text')}>
          <Checkbox
            checked={compressedGas.checked}
            onChange={(event) => compressedGas.onChange(event.target.checked)}
          />
          {t('industry.compressedGasToggle')}
        </label>
      )}
      <Tooltip content={copyDisabled ? t('industry.copyShoppingListNothing') : null}>
        <Button size="sm" onClick={onCopy} aria-disabled={copyDisabled || undefined}>
          {copyState === 'copied' ? (
            <Icon.Done size={Icon.ICON_SIZE.sm} aria-hidden="true" />
          ) : copyState === 'failed' ? (
            <Icon.Warn size={Icon.ICON_SIZE.sm} aria-hidden="true" className="text-danger" />
          ) : (
            <Icon.CopyToClipboard size={Icon.ICON_SIZE.sm} aria-hidden="true" />
          )}
          <span aria-hidden="true" className="max-md:hidden">
            {copyState === 'copied'
              ? t('industry.copyShoppingListDone')
              : copyState === 'failed'
                ? t('industry.copyShoppingListFailed')
                : t('industry.copyShoppingListShort')}
          </span>
          <span className="sr-only">
            {copyState === 'copied'
              ? t('industry.copyShoppingListDone')
              : copyState === 'failed'
                ? t('industry.copyShoppingListFailed')
                : t('industry.copyShoppingList')}
          </span>
        </Button>
      </Tooltip>
      {showExport && (
        <TableActionsMenu name={t('industry.materials')} tableExport={materialsExport} />
      )}
      <IconButton
        size="sm"
        icon={<Icon.Refresh />}
        label={t('industry.refresh')}
        onClick={onRefresh}
      />
    </span>
  );
}
