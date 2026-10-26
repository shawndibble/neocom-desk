import { allMembers, type DisplayRow, type GroupMember } from './groupRows';

/**
 * One entry in a Tax row's right-click / ⋮ menu. They mirror what the row's
 * detail modal offers (`RowDetailModal`, `GroupSummaryModal`), so the menu is
 * a shortcut to the same actions, not a second set of rules.
 */
export type RowMenuAction =
  | {
      id:
        | 'view'
        | 'edit'
        | 'settleUp'
        | 'resolve'
        | 'reviewSplit'
        | 'markPaid'
        | 'markGroupPaid'
        | 'unmarkPaid'
        | 'linkWallet'
        | 'linkTransaction'
        | 'join'
        | 'split'
        | 'copyBreakdown'
        | 'dismiss'
        | 'undismiss'
        | 'uncombine'
        | 'unassign'
        | 'corpPay';
    }
  | { id: 'takeOut'; member: GroupMember };

/** Corp Tax Book rows are decided by the book: view them, and pay while owed. */
function corpRowActions(dr: DisplayRow): RowMenuAction[][] {
  const state = dr.corp?.kind === 'row' ? dr.corp.view.state : null;
  const owing =
    state === 'billed' && (dr.corp?.kind === 'row' ? (dr.corp.view.taxOwed ?? 0) > 0 : false);
  return owing ? [[{ id: 'view' }, { id: 'corpPay' }]] : [[{ id: 'view' }]];
}

/**
 * The menu's actions for a row, in groups (a separator between each), View
 * details first. Each rule matches the detail modal's: Settle up for an owed
 * row, Accept new total for a grown one, then Edit, then the rarer moves.
 */
export function rowMenuActions(dr: DisplayRow): RowMenuAction[][] {
  if (dr.corp?.kind === 'row') return corpRowActions(dr);
  const view: RowMenuAction = { id: 'view' };

  if (dr.status === 'unassigned') return [[view, { id: 'dismiss' }, { id: 'join' }]];
  if (dr.status === 'dismissed') return [[view, { id: 'undismiss' }]];

  const members = allMembers(dr);
  if (dr.groupMembers) {
    const anyOutstanding = members.some((m) => m.assignment.status === 'outstanding');
    const anyGrown = members.some((m) => m.assignment.status === 'needs-review');
    const allPaid = members.every((m) => m.assignment.status === 'paid');
    const lead: RowMenuAction[] = [view];
    if (anyGrown) lead.push({ id: 'resolve' });
    else if (dr.status === 'outstanding') lead.push({ id: 'settleUp' });
    lead.push({ id: 'edit' });
    const payments: RowMenuAction[] = [];
    if (anyOutstanding && dr.assignment?.payeeId) payments.push({ id: 'linkWallet' });
    if (allPaid) payments.push({ id: 'linkTransaction' });
    if (anyOutstanding) payments.push({ id: 'markGroupPaid' });
    const regroup: RowMenuAction[] = [
      ...[...members]
        .sort((a, b) => a.row.entry.date.localeCompare(b.row.entry.date))
        .map((member): RowMenuAction => ({ id: 'takeOut', member })),
      { id: 'uncombine' },
    ];
    const groups: RowMenuAction[][] = [lead, payments, regroup, [{ id: 'unassign' }]];
    return groups.filter((g) => g.length > 0);
  }

  const { status } = dr;
  const lead: RowMenuAction[] = [view];
  if (status === 'outstanding') lead.push({ id: 'settleUp' });
  if (status === 'needs-review') {
    lead.push({ id: 'resolve' });
    if (!dr.assignment?.groupId) lead.push({ id: 'reviewSplit' });
  }
  lead.push({ id: 'edit' });

  const more: RowMenuAction[] = [];
  if (status === 'outstanding' && dr.assignment?.payeeId) more.push({ id: 'linkWallet' });
  if (status === 'paid') more.push({ id: 'linkTransaction' });
  if (status === 'outstanding') more.push({ id: 'markPaid' });
  if (status === 'paid') more.push({ id: 'unmarkPaid' });
  if (status === 'outstanding') more.push({ id: 'join' });
  if ((status === 'outstanding' || status === 'paid') && !dr.assignment?.groupId)
    more.push({ id: 'split' });

  const groups: RowMenuAction[][] = [lead, more, [{ id: 'copyBreakdown' }], [{ id: 'unassign' }]];
  return groups.filter((g) => g.length > 0);
}
