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
  overdue: (OfBook & MemberNoticeView & { declarerId?: number })[];
  uncredited: (OfBook & UncreditedDonation)[];
  inReview: (OfBook & { donations: InReviewPayment[] })[];
  alsoBilled: (OfBook & { payeeIds: string[]; rowId: string })[];
}

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
    if (held.length > 0) out.inReview.push({ ...of, donations: held });
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
