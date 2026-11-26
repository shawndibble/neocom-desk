import { allMembers, type DisplayRow, type GroupMember } from './groupRows';

export type RowMenuAction =
  | {
      id:
        | 'view'
        | 'edit'
        | 'settleUp'
        | 'resolve'
        | 'reviewSplit'
        | 'linkWallet'
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

function corpRowActions(dr: DisplayRow): RowMenuAction[][] {
  const state = dr.corp?.kind === 'row' ? dr.corp.view.state : null;
  const owing =
    (state === 'billed' || state === 'estimate') &&
    (dr.corp?.kind === 'row' ? (dr.corp.view.taxOwed ?? 0) > 0 : false);
  const lead: RowMenuAction[] = owing ? [{ id: 'view' }, { id: 'corpPay' }] : [{ id: 'view' }];
  return state === 'estimate' ? [[...lead, { id: 'edit' }], [{ id: 'split' }]] : [lead];
}

export function rowMenuActions(dr: DisplayRow): RowMenuAction[][] {
  if (dr.corp?.kind === 'row') return corpRowActions(dr);
  const view: RowMenuAction = { id: 'view' };

  if (dr.status === 'unassigned') return [[view, { id: 'dismiss' }, { id: 'join' }]];
  if (dr.status === 'dismissed') return [[view, { id: 'undismiss' }]];

  const members = allMembers(dr);
  if (dr.groupMembers) {
    const anyGrown = members.some((m) => m.assignment.status === 'needs-review');
    const lead: RowMenuAction[] = [view];
    if (anyGrown) lead.push({ id: 'resolve' });
    else if (dr.status === 'outstanding') lead.push({ id: 'settleUp' });
    lead.push({ id: 'edit' });
    const payments: RowMenuAction[] = dr.assignment?.payeeId ? [{ id: 'linkWallet' }] : [];
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
  if ((status === 'outstanding' || status === 'paid') && dr.assignment?.payeeId)
    more.push({ id: 'linkWallet' });
  if (status === 'outstanding') more.push({ id: 'join' });
  if ((status === 'outstanding' || status === 'paid') && !dr.assignment?.groupId)
    more.push({ id: 'split' });

  const groups: RowMenuAction[][] = [lead, more, [{ id: 'copyBreakdown' }], [{ id: 'unassign' }]];
  return groups.filter((g) => g.length > 0);
}
