import { useMemo } from 'react';
import type { BookView, NeedsYouItem } from '@/engine/corpTaxBook/bookView';
import { planNotices, type NoticePlan } from '@/engine/corpTaxBook/lateNotices';
import type { NoticeRules } from '@/engine/corpTaxBook/notices';
import { uncountedToShow } from '@/engine/corpTaxBook/uncounted';
import { disputesToShow } from '@/engine/corpTaxBook/disputes';
import type { BookData } from '../taxBook/bookClient';
import { useBook } from './useBook';

const noticesByView = new WeakMap<BookView, { rules: NoticeRules; plans: NoticePlan[] }>();

/**
 * The late notices due now (#6294), planned once per view and rules: the Needs-you card, the
 * moons nav dot and the run all read it.
 */
export function plannedNotices(view: BookView, rules: NoticeRules): NoticePlan[] {
  const held = noticesByView.get(view);
  if (held && held.rules === rules) return held.plans;
  const plans = planNotices(view, rules);
  noticesByView.set(view, { rules, plans });
  return plans;
}

/**
 * Everything the Overview's "Needs you" lists, and how many cards that is: the
 * book's own items (`needsYou`, the tabs projection's), tax noted in a division the
 * book does not read (#6207), a Miner's dispute of a Conflict day until it is dismissed
 * or rejected (#6206), and one card when late notices are due (#6294). The panel, the Moons
 * visit and the Moons nav dot's background poll all count it here.
 */
export function needsYouOf(
  view: BookView,
  data: Pick<BookData, 'uncounted' | 'disputes'>,
  divisions: readonly number[],
  needsYou: NeedsYouItem[],
  noticeRules: NoticeRules
) {
  const uncounted = uncountedToShow({ donations: data.uncounted ?? [] }, divisions);
  const disputes = disputesToShow(data.disputes ?? [], view.input.dismissals);
  const noticesDue = plannedNotices(view, noticeRules);
  return {
    needsYou,
    uncounted,
    disputes,
    noticesDue,
    count: needsYou.length + uncounted.length + disputes.length + (noticesDue.length > 0 ? 1 : 0),
  };
}

/** `needsYouOf` for the open book. */
export function useNeedsYou() {
  const { view, data, settings } = useBook();
  const { needsYou } = view;
  return useMemo(
    () => needsYouOf(view, data, settings.divisions, needsYou, settings.noticeRules),
    [view, data, settings.divisions, settings.noticeRules, needsYou]
  );
}
