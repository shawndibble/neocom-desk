import {
  DAY_SETTLE_TOLERANCE_PCT,
  type MinerRunningAccount,
} from '../corpTaxBook/minerRunningAccount';
import type { Miner } from '../corpTaxBook/charges';
import type { OreLine } from './types';

export const RECORD_CHANGE_REASONS = [
  'tolerance',
  'autoFix',
  'fixMyRecords',
  'autoAssign',
] as const;

export type RecordChangeReason = (typeof RECORD_CHANGE_REASONS)[number];

export type AssignmentChangeReason = Exclude<RecordChangeReason, 'tolerance'>;

export interface AssignmentTerms {
  payeeId: string | null;
  taxPct: number;
  taxOwed: number;
  oreLines: readonly OreLine[];
}

export interface AssignmentChange {
  assignmentId: string;
  before: AssignmentTerms | null;
  after: AssignmentTerms | null;
}

export interface ToleranceCloseOut {
  billed: number;
  paid: number;
  writtenOff: number;
  tolerancePct: number;
  tolerance: number;
  exempt?: boolean;
  paymentId?: string;
}

interface RecordChangeBase {
  id: string;
  at: string;
  date: string;
  corporationId?: number;
  minerId?: string;
}

export interface ToleranceRecordChange extends RecordChangeBase {
  reason: 'tolerance';
  corporationId: number;
  minerId: string;
  closeOut: ToleranceCloseOut;
}

export interface AssignmentRecordChange extends RecordChangeBase {
  reason: AssignmentChangeReason;
  assignments: AssignmentChange[];
}

export type RecordChange = ToleranceRecordChange | AssignmentRecordChange;

export function toleranceRecordChangeId(
  corporationId: number,
  minerId: string,
  date: string
): string {
  return `tolerance:${corporationId}:${minerId}:${date}`;
}

export interface ToleranceRecordChangeInput {
  corporationId: number;
  minerId: string;
  account: Pick<MinerRunningAccount, 'toleranceCloseOuts' | 'input' | 'writtenOffDays'>;
  payments: readonly { id: string; at: string }[];
  existingIds: ReadonlySet<string>;
}

export function planToleranceRecordChanges({
  corporationId,
  minerId,
  account,
  payments,
  existingIds,
}: ToleranceRecordChangeInput): ToleranceRecordChange[] {
  const pct = account.input.dayTolerancePct ?? DAY_SETTLE_TOLERANCE_PCT;
  return account.writtenOffDays(payments).flatMap((w): ToleranceRecordChange[] => {
    const day = account.toleranceCloseOuts.get(w.date);
    if (w.paymentId === undefined || !day) return [];
    const id = toleranceRecordChangeId(corporationId, minerId, w.date);
    if (existingIds.has(id)) return [];
    return [
      {
        id,
        reason: 'tolerance',
        at: w.at,
        date: w.date,
        corporationId,
        minerId,
        closeOut: {
          billed: day.billed,
          paid: day.paid,
          writtenOff: day.writtenOff,
          tolerancePct: pct,
          tolerance: day.limit,
          ...(day.exempt ? { exempt: true } : {}),
          paymentId: w.paymentId,
        },
      },
    ];
  });
}

export interface ToleranceBookInput {
  corporationId: number;
  characterIds: readonly number[];
  miners: readonly Pick<Miner, 'id' | 'characterIds'>[];
  accounts: readonly {
    minerId: string;
    account: ToleranceRecordChangeInput['account'];
    payments: readonly { id: string; at: string }[];
  }[];
}

export interface OwnedRecordChange<C extends RecordChange = RecordChange> {
  characterId: number;
  change: C;
}

export function planBookToleranceRecordChanges(
  books: readonly ToleranceBookInput[],
  existingIds: ReadonlySet<string>
): OwnedRecordChange<ToleranceRecordChange>[] {
  return books.flatMap((book) => {
    const tracked = new Set(book.characterIds);
    return book.accounts.flatMap(({ minerId, account, payments }) => {
      const miner = book.miners.find((m) => m.id === minerId);
      const characterId = miner?.characterIds.find((id) => tracked.has(id));
      if (characterId === undefined) return [];
      return planToleranceRecordChanges({
        corporationId: book.corporationId,
        minerId,
        account,
        payments,
        existingIds,
      }).map((change) => ({ characterId, change }));
    });
  });
}

export interface AssignmentRecordChangeInput {
  id: string;
  reason: AssignmentChangeReason;
  at: string;
  date: string;
  corporationId?: number;
  minerId?: string;
  assignments: readonly AssignmentChange[];
}

function oreKey(lines: readonly OreLine[]): string {
  return [...lines]
    .sort((a, b) => a.typeId - b.typeId || a.quantity - b.quantity)
    .map((l) => `${l.typeId}:${l.quantity}`)
    .join(',');
}

function sameTerms(a: AssignmentTerms | null, b: AssignmentTerms | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.payeeId === b.payeeId &&
    a.taxPct === b.taxPct &&
    a.taxOwed === b.taxOwed &&
    oreKey(a.oreLines) === oreKey(b.oreLines)
  );
}

export function assignmentRecordChange(
  input: AssignmentRecordChangeInput
): AssignmentRecordChange | null {
  const changed = input.assignments.filter((a) => !sameTerms(a.before, a.after));
  if (changed.length === 0) return null;
  return {
    id: input.id,
    reason: input.reason,
    at: input.at,
    date: input.date,
    ...(input.corporationId !== undefined ? { corporationId: input.corporationId } : {}),
    ...(input.minerId !== undefined ? { minerId: input.minerId } : {}),
    assignments: changed.map((a) => ({
      assignmentId: a.assignmentId,
      before: a.before,
      after: a.after,
    })),
  };
}

export function recordChangesForBook(
  changes: readonly RecordChange[],
  corporationId: number,
  minerId: string
): RecordChange[] {
  return changes.filter(
    (c) => c.corporationId === corporationId && (c.minerId === undefined || c.minerId === minerId)
  );
}

export function recordChangesForPayee(
  changes: readonly RecordChange[],
  isPayee: (payeeId: string) => boolean
): RecordChange[] {
  return changes.filter(
    (c) =>
      c.reason !== 'tolerance' &&
      c.assignments.some((a) =>
        [a.before?.payeeId, a.after?.payeeId].some((id) => typeof id === 'string' && isPayee(id))
      )
  );
}
