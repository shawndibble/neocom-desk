import type { OreLine } from '../miningTax/types';
import type { AssignmentChangeReason } from '../miningTax/recordChanges';
import type { PersonalAllocation } from './personal';

export interface ClosedDayBook {
  corporationId: number;
  minerId: string;
  ownPayeeIds: readonly string[];
  share: readonly OreLine[];
  taxPct: number;
  unitPrices: Readonly<Record<number, number>>;
  hubId: string;
  oreForm: 'compressed' | 'raw';
  moneyApplied: boolean;
}

export interface ClosedDay {
  characterId: number;
  date: string;
  solarSystemId: number;
  oreLines: readonly OreLine[];
  allocations: readonly PersonalAllocation[];
  books: readonly ClosedDayBook[];
}

export interface FixTerms {
  oreLines: OreLine[];
  taxPct: number;
}

export interface AssignmentFix {
  assignmentId: string | null;
  payeeId: string;
  corporationId?: number;
  before: FixTerms | null;
  after: FixTerms;
  releasedTypeIds: number[];
}

export type ClosedDayBlocker =
  { kind: 'assignmentPaid'; assignmentId: string } | { kind: 'bookPayment'; corporationId: number };

export interface ClosedDayPlan {
  characterId: number;
  date: string;
  solarSystemId: number;
  state: 'aligned' | 'fix' | 'conflict';
  fixes: AssignmentFix[];
  blockers: ClosedDayBlocker[];
  books: readonly ClosedDayBook[];
}

type Held = Map<number, number>;

const heldOf = (lines: readonly OreLine[]): Held => {
  const out: Held = new Map();
  for (const l of lines) out.set(l.typeId, (out.get(l.typeId) ?? 0) + l.quantity);
  return out;
};

const linesOf = (held: Held): OreLine[] =>
  [...held]
    .filter(([, quantity]) => quantity > 0)
    .map(([typeId, quantity]) => ({ typeId, quantity }))
    .sort((a, b) => a.typeId - b.typeId);

const sameLines = (a: Held, b: Held) => {
  const x = linesOf(a);
  const y = linesOf(b);
  return (
    x.length === y.length &&
    x.every((l, i) => l.typeId === y[i]!.typeId && l.quantity === y[i]!.quantity)
  );
};

const add = (held: Held, typeId: number, quantity: number) =>
  held.set(typeId, (held.get(typeId) ?? 0) + quantity);

function take(from: Held, typeId: number, want: number): number {
  const got = Math.min(want, from.get(typeId) ?? 0);
  if (got > 0) from.set(typeId, (from.get(typeId) ?? 0) - got);
  return got;
}

export function planClosedDayFix(
  day: ClosedDay,
  paidInto: ReadonlySet<string> = new Set()
): ClosedDayPlan {
  const books = [...day.books].sort((a, b) => a.corporationId - b.corporationId);
  const base = {
    characterId: day.characterId,
    date: day.date,
    solarSystemId: day.solarSystemId,
    books,
  };
  const allocations = day.allocations.filter(
    (a): a is PersonalAllocation & { id: string } => a.id !== undefined
  );
  if (allocations.length === 0) return { ...base, state: 'aligned', fixes: [], blockers: [] };

  const bookOf = (a: PersonalAllocation) => books.find((b) => b.ownPayeeIds.includes(a.payeeId));
  const held = new Map(allocations.map((a) => [a.id, heldOf(a.oreLines)]));
  const free = heldOf(day.oreLines);
  for (const a of allocations) for (const l of a.oreLines) take(free, l.typeId, l.quantity);
  const ownOf = (b: ClosedDayBook) => allocations.filter((a) => bookOf(a) === b);
  const ownTotal = (b: ClosedDayBook, typeId: number, extra?: Held) =>
    ownOf(b).reduce((sum, a) => sum + (held.get(a.id)!.get(typeId) ?? 0), 0) +
    (extra?.get(typeId) ?? 0);

  for (const b of books) {
    const want = heldOf(b.share);
    const own = ownOf(b);
    const types = new Set(own.flatMap((a) => a.oreLines.map((l) => l.typeId)));
    for (const typeId of types) {
      let excess = ownTotal(b, typeId) - (want.get(typeId) ?? 0);
      for (const a of [...own].reverse()) {
        if (excess <= 0) break;
        const got = take(held.get(a.id)!, typeId, excess);
        add(free, typeId, got);
        excess -= got;
      }
    }
  }

  const others = allocations.filter((a) => bookOf(a) === undefined);
  const created = new Map<ClosedDayBook, Held>();
  for (const b of books) {
    const own = ownOf(b);
    const payeeId = own[0]?.payeeId ?? b.ownPayeeIds[0];
    if (payeeId === undefined) continue;
    const into = own[0] ? held.get(own[0].id)! : new Map<number, number>();
    for (const [typeId, quantity] of heldOf(b.share)) {
      let need = quantity - ownTotal(b, typeId, own[0] ? undefined : into);
      if (need <= 0) continue;
      const got = take(free, typeId, need);
      add(into, typeId, got);
      need -= got;
      for (const a of others) {
        if (need <= 0) break;
        const moved = take(held.get(a.id)!, typeId, need);
        add(into, typeId, moved);
        need -= moved;
      }
    }
    if (!own[0] && linesOf(into).length > 0) created.set(b, into);
  }

  const reducedTypes = (before: Held, after: Held) =>
    [...before].filter(([typeId, q]) => (after.get(typeId) ?? 0) < q).map(([typeId]) => typeId);
  const sortedIds = (ids: Iterable<number>) => [...new Set(ids)].sort((x, y) => x - y);

  const fixes: AssignmentFix[] = [];
  for (const a of allocations) {
    const b = bookOf(a);
    const before = heldOf(a.oreLines);
    const after = held.get(a.id)!;
    const empty = linesOf(after).length === 0;
    const taxPct = b && !empty ? b.taxPct : a.taxPct;
    const changed =
      !sameLines(before, after) ||
      taxPct !== a.taxPct ||
      (b !== undefined && a.status === 'needs-review');
    if (!changed) continue;
    fixes.push({
      assignmentId: a.id,
      payeeId: a.payeeId,
      ...(b ? { corporationId: b.corporationId } : {}),
      before: { oreLines: linesOf(before), taxPct: a.taxPct },
      after: { oreLines: linesOf(after), taxPct },
      releasedTypeIds: sortedIds([
        ...reducedTypes(before, after),
        ...(b ? b.share.map((l) => l.typeId) : []),
      ]),
    });
  }
  for (const [b, into] of created) {
    fixes.push({
      assignmentId: null,
      payeeId: b.ownPayeeIds[0]!,
      corporationId: b.corporationId,
      before: null,
      after: { oreLines: linesOf(into), taxPct: b.taxPct },
      releasedTypeIds: sortedIds(b.share.map((l) => l.typeId)),
    });
  }
  if (fixes.length === 0) return { ...base, state: 'aligned', fixes, blockers: [] };

  const byId = new Map(allocations.map((a) => [a.id, a]));
  const blockers: ClosedDayBlocker[] = [
    ...fixes.flatMap((f): ClosedDayBlocker[] => {
      if (f.assignmentId === null) return [];
      const a = byId.get(f.assignmentId)!;
      return a.status === 'paid' || paidInto.has(a.id)
        ? [{ kind: 'assignmentPaid', assignmentId: a.id }]
        : [];
    }),
    ...books
      .filter((b) => b.moneyApplied)
      .map((b): ClosedDayBlocker => ({ kind: 'bookPayment', corporationId: b.corporationId })),
  ];
  return { ...base, state: blockers.length > 0 ? 'conflict' : 'fix', fixes, blockers };
}

const termsKey = (t: FixTerms) =>
  `${t.oreLines.map((l) => `${l.typeId}x${l.quantity}`).join('+')}@${t.taxPct}`;

export function closedDayRecordChangeId(
  plan: Pick<ClosedDayPlan, 'characterId' | 'date' | 'solarSystemId' | 'fixes'>,
  reason: AssignmentChangeReason
): string {
  const outcome = plan.fixes
    .map((f) => `${f.assignmentId ?? `new-${f.payeeId}`}=${termsKey(f.after)}`)
    .join(',');
  return `${reason}:${plan.characterId}:${plan.date}:${plan.solarSystemId}:${outcome}`;
}
