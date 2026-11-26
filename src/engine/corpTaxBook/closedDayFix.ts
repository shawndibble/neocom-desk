import type { OreLine } from '../miningTax/types';
import { addLines, minusLines, sameLines } from '../miningTax/oreLines';
import type { AssignmentChangeReason } from '../miningTax/recordChanges';
import { previewTakeover, type PersonalAllocation } from './personal';

export interface ClosedDayBook {
  corporationId: number;
  minerId: string;
  ownPayeeIds: readonly string[];
  share: readonly OreLine[];
  taxPct: number;
  unitPrices: Readonly<Record<number, number>>;
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
  addLines(
    [...held].map(([typeId, quantity]) => ({ typeId, quantity })),
    []
  );

const add = (held: Held, typeId: number, quantity: number) =>
  held.set(typeId, (held.get(typeId) ?? 0) + quantity);

function take(from: Held, typeId: number, want: number): number {
  const got = Math.min(want, from.get(typeId) ?? 0);
  if (got > 0) from.set(typeId, (from.get(typeId) ?? 0) - got);
  return got;
}

export function planClosedDayFix(day: ClosedDay, paidInto: ReadonlySet<string>): ClosedDayPlan {
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

  const isPaid = (a: PersonalAllocation & { id: string }) =>
    a.status === 'paid' || paidInto.has(a.id);
  const others = allocations
    .filter((a) => bookOf(a) === undefined)
    .sort((a, b) => Number(isPaid(a)) - Number(isPaid(b)));
  const created = new Map<ClosedDayBook, Held>();
  for (const b of books) {
    const own = ownOf(b);
    const payeeId = own[0]?.payeeId ?? b.ownPayeeIds[0];
    if (payeeId === undefined) continue;
    const into = own[0] ? held.get(own[0].id)! : new Map<number, number>();
    const short: OreLine[] = [];
    for (const [typeId, quantity] of heldOf(b.share)) {
      const need = quantity - ownTotal(b, typeId, own[0] ? undefined : into);
      if (need <= 0) continue;
      const got = take(free, typeId, need);
      add(into, typeId, got);
      if (need > got) short.push({ typeId, quantity: need - got });
    }
    const steps = previewTakeover(
      others.map((a) => ({ ...a, oreLines: linesOf(held.get(a.id)!) })),
      short
    );
    for (const step of steps) {
      held.set(others[step.index]!.id, heldOf(step.after));
      for (const l of minusLines(step.before, step.after)) add(into, l.typeId, l.quantity);
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
      !sameLines(linesOf(before), linesOf(after)) ||
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
      return isPaid(a) ? [{ kind: 'assignmentPaid', assignmentId: a.id }] : [];
    }),
    ...books
      .filter((b) => b.moneyApplied)
      .map((b): ClosedDayBlocker => ({ kind: 'bookPayment', corporationId: b.corporationId })),
  ];
  return { ...base, state: blockers.length > 0 ? 'conflict' : 'fix', fixes, blockers };
}

export type ClosedDayDifference =
  | { kind: 'overListed'; corporationId: number; payeeId: string; lines: OreLine[] }
  | { kind: 'elsewhere'; corporationIds: number[]; payeeId: string; lines: OreLine[] }
  | { kind: 'unlisted'; corporationIds: number[]; lines: OreLine[] }
  | { kind: 'rate'; corporationId: number; payeeId: string; yours: number; book: number };

export function closedDayDifferences(plan: Pick<ClosedDayPlan, 'fixes'>): ClosedDayDifference[] {
  const out: ClosedDayDifference[] = [];
  const gainers = new Set<number>();
  let gained: OreLine[] = [];
  let moved: OreLine[] = [];
  const elsewhere: { payeeId: string; lines: OreLine[] }[] = [];
  for (const fix of plan.fixes) {
    const before = fix.before?.oreLines ?? [];
    const lost = minusLines(before, fix.after.oreLines);
    if (fix.corporationId === undefined) {
      if (lost.length === 0) continue;
      moved = addLines(moved, lost);
      elsewhere.push({ payeeId: fix.payeeId, lines: lost });
      continue;
    }
    if (lost.length > 0)
      out.push({
        kind: 'overListed',
        corporationId: fix.corporationId,
        payeeId: fix.payeeId,
        lines: lost,
      });
    const got = minusLines(fix.after.oreLines, before);
    if (got.length > 0) {
      gainers.add(fix.corporationId);
      gained = addLines(gained, got);
    }
    if (fix.before && fix.before.taxPct !== fix.after.taxPct)
      out.push({
        kind: 'rate',
        corporationId: fix.corporationId,
        payeeId: fix.payeeId,
        yours: fix.before.taxPct,
        book: fix.after.taxPct,
      });
  }
  const corporationIds = [...gainers].sort((a, b) => a - b);
  for (const d of elsewhere) out.push({ kind: 'elsewhere', corporationIds, ...d });
  const unlisted = minusLines(gained, moved);
  if (unlisted.length > 0) out.push({ kind: 'unlisted', corporationIds, lines: unlisted });
  return out;
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
