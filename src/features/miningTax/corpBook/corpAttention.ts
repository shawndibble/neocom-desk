/**
 * What the member's Corp Tax Books need them to look at (#6204), as plain facts for the Tax
 * tab's attention strip: Overdue Statements, donations a book never credited, and ore a book
 * bills that the member's own list also owes another Payee.
 */
import type { InFlightDonation, OverdueStatementView } from '@/engine/corpTaxBook/personal';
import type { CorpBookView } from './corpBookView';

interface OfBook {
  corporationId: number;
  corpName: string;
}

export interface CorpBookAttention {
  overdue: (OfBook & OverdueStatementView)[];
  uncredited: (OfBook & InFlightDonation)[];
  /** Per book: the Payees whose unpaid ore it bills too, and the first such row to open. */
  alsoBilled: (OfBook & { payeeIds: string[]; rowId: string })[];
}

export function corpBookAttention(view: CorpBookView | null): CorpBookAttention {
  const out: CorpBookAttention = { overdue: [], uncredited: [], alsoBilled: [] };
  if (!view) return out;
  for (const book of view.books) {
    const of: OfBook = { corporationId: book.loaded.corporationId, corpName: book.corpName };
    for (const s of book.summary.overdue) out.overdue.push({ ...of, ...s });
    for (const d of book.summary.uncredited) out.uncredited.push({ ...of, ...d });
    // A Conflict is not billed yet, and a paid listing owes nobody: only billed ore still owed
    // to another Payee is counted twice.
    const rows = view.overlay.rows.filter(
      (r) =>
        r.corporationId === of.corporationId &&
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
