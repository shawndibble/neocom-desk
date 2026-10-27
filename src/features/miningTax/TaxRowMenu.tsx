import { Fragment, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { MenuItem, MenuSeparator, RowActionsMenu, useOpenAfterMenu } from '@/components/ui';
import { formatDateRange, type DisplayRow } from './groupRows';
import { rowMenuActions, type RowMenuAction } from './rowMenu';

interface TaxRowMenuProps {
  dr: DisplayRow;
  systemName: string;
  /** Runs one action on this row — `useTaxDialogs`'s `runRowMenuAction`. */
  onAction: (action: RowMenuAction, dr: DisplayRow) => void;
  children: ReactElement;
}

const LABEL_KEY: Record<Exclude<RowMenuAction['id'], 'takeOut'>, string> = {
  view: 'miningTax.rowMenu.view',
  edit: 'miningTax.detail.editAction',
  settleUp: 'miningTax.settleUpAction',
  resolve: 'miningTax.resolveConfirm',
  reviewSplit: 'miningTax.detail.reviewSplitAction',
  markPaid: 'miningTax.markPaidAction',
  markGroupPaid: 'miningTax.markGroupPaidAction',
  unmarkPaid: 'miningTax.unmarkPaidAction',
  linkWallet: 'miningTax.detail.linkWalletPayment',
  linkTransaction: 'miningTax.linkTransactionAction',
  join: 'miningTax.joinAction',
  split: 'miningTax.detail.splitAction',
  copyBreakdown: 'miningTax.detail.breakdown.copy',
  dismiss: 'miningTax.dismissAction',
  undismiss: 'miningTax.undismissAction',
  uncombine: 'miningTax.combined.uncombineAll',
  unassign: 'miningTax.detail.unassignAction',
  corpPay: 'miningTax.corpBook.payAction',
};

/**
 * A Tax row's right-click menu and its ⋮ button, from one list of actions
 * (`rowMenuActions`): the same ones its detail modal offers, View details
 * first. Each runs after the menu has closed, so a dialog it opens hands focus
 * back to the ⋮ when it closes. A row with only View details gets no menu —
 * clicking the row already does that (DESIGN.md §6c restraint).
 */
export function TaxRowMenu({ dr, systemName, onAction, children }: TaxRowMenuProps) {
  const { t } = useTranslation();
  const openAfterMenu = useOpenAfterMenu();
  const groups = rowMenuActions(dr);
  if (groups.flat().length < 2) return children;

  const dates = [dr.row.entry.date, ...(dr.groupMembers ?? []).map((m) => m.row.entry.date)].sort();
  const name = t('miningTax.rowMenu.name', { date: formatDateRange(dates), system: systemName });

  const items = groups.map((group, index) => (
    // A group's first action identifies it; a take-out is keyed by its day.
    <Fragment key={group[0].id + index}>
      {index > 0 && <MenuSeparator />}
      {group.map((action) => (
        <MenuItem
          key={action.id === 'takeOut' ? `takeOut-${action.member.assignment.id}` : action.id}
          className={action.id === 'unassign' ? 'text-danger' : undefined}
          onSelect={() => openAfterMenu.run(() => onAction(action, dr))}
        >
          {action.id === 'takeOut'
            ? t('miningTax.combined.takeOut', { date: action.member.row.entry.date })
            : action.id === 'unassign' && dr.groupMembers
              ? t('miningTax.combined.unassignAll')
              : t(LABEL_KEY[action.id])}
        </MenuItem>
      ))}
    </Fragment>
  ));

  return (
    <RowActionsMenu
      name={name}
      items={items}
      onCloseAutoFocus={openAfterMenu.onCloseAutoFocus}
      linksKeepBrowserMenu
    >
      {children}
    </RowActionsMenu>
  );
}
