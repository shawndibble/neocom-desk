/**
 * What the member's Corp Tax Books need them to look at (#6204), as plain facts for the Tax
 * tab's attention strip: Overdue Statements, donations a book never credited, and ore a book
 * bills that the member's own list also owes another Payee.
 */
import type { OverdueStatementView, UncreditedDonation } from '@/engine/corpTaxBook/personal';
import type { MultiSelectFilter } from '@/lib/multiSelectFilter';
import type { CorpBookView } from './corpBookView';

interface OfBook {
  corporationId: number;
  corpName: string;
}

export interface CorpBookAttention {
  /**
   * `declarerId`: the first tracked Character in view that the Statement bills — its sign-in is
   * on the Statement, so it may declare (#6206). Absent when none is.
   */
  overdue: (OfBook & OverdueStatementView & { declarerId?: number })[];
  uncredited: (OfBook & UncreditedDonation)[];
  /** Per book: the Payees whose unpaid ore it bills too, and the first such row to open. */
  alsoBilled: (OfBook & { payeeIds: string[]; rowId: string })[];
}

/**
 * Only what the Characters in `characters` (the Tax tab's resolved Character filter) mined, paid
 * or are billed for: an Overdue Statement billing one of them, a donation one of them made, the
 * also-billed rows of their days. A Statement billing no tracked Character shows only for all
 * Characters.
 */
export function corpBookAttention(
  view: CorpBookView | null,
  characters: MultiSelectFilter<number> = 'all'
): CorpBookAttention {
  const out: CorpBookAttention = { overdue: [], uncredited: [], alsoBilled: [] };
  if (!view) return out;
  const inView = (id: number) => characters === 'all' || characters.has(id);
  for (const book of view.books) {
    const { loaded } = book;
    const of: OfBook = { corporationId: loaded.corporationId, corpName: book.corpName };
    for (const s of book.summary.overdue) {
      const tracked = (loaded.statements.find((x) => x.id === s.statementId)?.lines ?? [])
        .map((l) => l.characterId)
        .filter((id): id is number => id !== undefined && loaded.characterIds.includes(id));
      const declarerId = tracked.find(inView);
      if (declarerId === undefined && characters !== 'all') continue;
      out.overdue.push({ ...of, ...s, ...(declarerId !== undefined && { declarerId }) });
    }
    for (const d of book.summary.uncredited) {
      if (inView(d.characterId)) out.uncredited.push({ ...of, ...d });
    }
    // A Conflict is not billed yet, and a paid listing owes nobody: only billed ore still owed
    // to another Payee is counted twice.
    const rows = view.overlay.rows.filter(
      (r) =>
        r.corporationId === of.corporationId &&
        inView(r.characterId) &&
        (r.state === 'billed' || r.state === 'paid') &&
        r.overlap !== undefined &&
        !r.overlap.paid
    );
    if (rows.length > 0) {
      out.alsoBilled.push({
        ...of,
        payeeIds: [...new Set(rows.flatMap((r) => r.overlap?.payeeIds ?? []))],
        rowId: rows[0].id,
      });
    }
  }
  return out;
}
