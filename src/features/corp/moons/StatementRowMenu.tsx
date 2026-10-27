/**
 * The period page's Statement row menu (#5287): Record payment and Send reminder, both aimed at
 * that row's Statement. Send reminder is disabled once the Statement is settled or its one officer
 * reminder is sent; the reason prints under the item (no tooltip on touch) and in a tooltip.
 * Record payment stays on a settled Statement with a hint. Officers only; Open is the row click.
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { DisabledMenuItem, MenuItem, RowActionsMenu } from '@/components/ui';
import type { PeriodStatementRow } from '@/engine/corpTaxBook/bookView';
import { useBook } from './useBook';
import { useMinerReminder } from './statementMailing';

const Reason = ({ text }: { text: string }) => (
  <span className="block text-xs text-text-dim">{text}</span>
);

export function StatementRowMenu({
  row,
  minerName,
  onRecord,
  onNotice,
  onCloseAutoFocus,
  onOpenChange,
  children,
}: {
  row: PeriodStatementRow;
  minerName: string;
  /** Opens the dialog after the menu closes (`useOpenAfterMenu`'s `run`, bound by the caller). */
  onRecord: (row: PeriodStatementRow) => void;
  onNotice: (text: string) => void;
  onCloseAutoFocus: (event: Event) => void;
  onOpenChange?: (open: boolean) => void;
  children: ReactElement;
}) {
  const { t } = useTranslation();
  const { canEdit } = useBook();
  const reminder = useMinerReminder(row.statement.minerId, onNotice, row.statement.id);
  if (!canEdit) return children;
  const remind = t('corpTaxBook.moons.miner.remind');
  return (
    <RowActionsMenu
      name={minerName}
      onCloseAutoFocus={onCloseAutoFocus}
      onOpenChange={onOpenChange}
      items={
        <>
          <MenuItem onSelect={() => onRecord(row)}>
            <span>
              {t('corpTaxBook.moons.miner.record')}
              {row.settled && <Reason text={t('corpTaxBook.moons.statementPeriod.alreadyPaid')} />}
            </span>
          </MenuItem>
          {reminder.block ? (
            <DisabledMenuItem reason={reminder.block}>
              <span>
                {remind}
                <Reason text={reminder.block} />
              </span>
            </DisabledMenuItem>
          ) : (
            <MenuItem onSelect={() => void reminder.send()}>{remind}</MenuItem>
          )}
        </>
      }
    >
      {children}
    </RowActionsMenu>
  );
}
