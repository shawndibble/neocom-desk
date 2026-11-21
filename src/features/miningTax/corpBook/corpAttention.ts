/**
 * What the member's Corp Tax Books need them to look at (#6204), as plain facts for the Tax
 * tab's attention strip: Late notices whose days are unpaid, donations a book never credited, donations it holds
 * for review without counting them, and ore a book bills that the member's own list also owes
 * another Payee.
 */
import { utcDayOf } from '../../../../functions/src/timeConstants';
import type { MemberNoticeView, UncreditedDonation } from '@/engine/corpTaxBook/personal';
import type { MultiSelectFilter } from '@/lib/multiSelectFilter';
import type { CorpBookView } from './corpBookView';
import type { InReviewPayment } from './corpBookStore';

interface OfBook {
  corporationId: number;
  corpName: string;
}

export interface CorpBookAttention {
  /**
   * Late notices whose days are unpaid. `declarerId`: the first tracked Character in view the
   * notice asked — its sign-in is on the notice, so it may declare (#6206). Absent when none is.
   */
  overdue: (OfBook & MemberNoticeView & { declarerId?: number })[];
  uncredited: (OfBook & UncreditedDonation)[];
  /**
   * Per book: the member's donations it holds for an officer's review without counting them
   * (#6207), oldest first. Only those paid on or after the book's start: before it they paid no mining it bills.
   */
  inReview: (OfBook & { donations: InReviewPayment[] })[];
  /** Per book: the Payees whose unpaid ore it bills too, and the first such row to open. */
  alsoBilled: (OfBook & { payeeIds: string[]; rowId: string })[];
}

/**
 * Only what the Characters in `characters` (the Tax tab's resolved Character filter) mined, paid
 * or are billed for: a Late notice asking one of them, a donation one of them made, the
 * also-billed rows of their days. A notice asking no tracked Character shows only for all
 * Characters.
 */
export function corpBookAttention(
  view: CorpBookView | null,
  characters: MultiSelectFilter<number> = 'all'
): CorpBookAttention {
  const out: CorpBookAttention = { overdue: [], uncredited: [], inReview: [], alsoBilled: [] };
  if (!view) return out;
  const inView = (id: number) => characters === 'all' || characters.has(id);
  for (const book of view.books) {
    const { loaded } = book;
    const of: OfBook = { corporationId: loaded.corporationId, corpName: book.corpName };
    for (const s of book.summary.notices) {
      const tracked = (loaded.notices.find((x) => x.id === s.noticeId)?.characterIds ?? []).filter(
        (id) => loaded.characterIds.includes(id)
      );
      const declarerId = tracked.find(inView);
      if (declarerId === undefined && characters !== 'all') continue;
      out.overdue.push({ ...of, ...s, ...(declarerId !== undefined && { declarerId }) });
    }
    for (const d of book.summary.uncredited) {
      if (inView(d.characterId)) out.uncredited.push({ ...of, ...d });
    }
    const held = (loaded.inReview ?? [])
      .filter((p) => inView(p.characterId) && utcDayOf(p.at) >= loaded.startDate)
      .sort((a, b) => a.at.localeCompare(b.at));
    // Counted as tax at once, each to its own donor's Miner: the book already holds the ISK, so
    // no Late notice is needed (and none can be blocked by a declaration already waiting on it).
    if (held.length > 0) out.inReview.push({ ...of, donations: held });
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
