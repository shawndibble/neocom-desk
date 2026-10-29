import { useTranslation } from 'react-i18next';
import { Button, DataAgeBadge, IconButton, LiveStatus } from '@/components/ui';
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
  /** Whether the Materials table has rows to export. */
  showExport: boolean;
  materialsExport: UseTableExport<MaterialTableRow>;
  onRefresh: () => void;
}

/**
 * The Materials panel's header controls: data age, the shopping-list copy,
 * the table export and refresh.
 */
export function PlanMaterialsActions({
  fetchedAt,
  copyState,
  copyDisabled,
  onCopy,
  showExport,
  materialsExport,
  onRefresh,
}: PlanMaterialsActionsProps) {
  const { t } = useTranslation();
  // `flex-wrap`: four items — data age, the shopping-list copy (its
  // label hidden below `md`), export and refresh — beside the panel
  // title; if they ever run out of room, wrapping inside the
  // (min-height, not fixed) header beats clipping.
  return (
    <span className="flex flex-wrap items-center gap-2 text-[0.6875rem] text-text-dim">
      {fetchedAt && <DataAgeBadge date={fetchedAt} />}
      {/*
      Gated on there being a remainder to order, not on the table
      having rows: a plan whose every material is already owned still
      renders a full table, and the list it would copy is empty.
    */}
      <LiveStatus>
        {copyState === 'copied'
          ? t('industry.copyShoppingListDone')
          : copyState === 'failed'
            ? t('industry.copyShoppingListFailed')
            : null}
      </LiveStatus>
      <Button size="sm" onClick={onCopy} disabled={copyDisabled}>
        {/* Both outcomes change the glyph as well as the words, so neither
            is carried by colour alone (docs/DESIGN.md §7). */}
        {copyState === 'copied' ? (
          <Icon.Done size={Icon.ICON_SIZE.sm} aria-hidden="true" />
        ) : copyState === 'failed' ? (
          <Icon.Warn size={Icon.ICON_SIZE.sm} aria-hidden="true" className="text-danger" />
        ) : (
          <Icon.CopyToClipboard size={Icon.ICON_SIZE.sm} aria-hidden="true" />
        )}
        {/* A short visible label from `md` up, icon-only below it so the
            header keeps its title on a phone; the full words stay the
            button's accessible name either way. */}
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
