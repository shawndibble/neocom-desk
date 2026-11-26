import { useMemo } from 'react';
import type { BookView } from '@/engine/corpTaxBook/bookView';
import { planNotices, type NoticePlan } from '@/engine/corpTaxBook/lateNotices';
import type { NoticeRules } from '@/engine/corpTaxBook/notices';
import { uncountedToShow } from '@/engine/corpTaxBook/uncounted';
import { disputesToShow } from '@/engine/corpTaxBook/disputes';
import type { BookData, GroupingAnswer } from '../taxBook/bookClient';
import { useBook } from './useBook';

const noticesByView = new WeakMap<BookView, { rules: NoticeRules; plans: NoticePlan[] }>();

export function plannedNotices(view: BookView, rules: NoticeRules): NoticePlan[] {
  const held = noticesByView.get(view);
  if (held && held.rules === rules) return held.plans;
  const plans = planNotices(view, rules);
  noticesByView.set(view, { rules, plans });
  return plans;
}

export function declinedGroupings(
  view: Pick<BookView, 'miners'>,
  answers: readonly GroupingAnswer[]
): GroupingAnswer[] {
  return answers.filter(
    (a) =>
      a.answer === 'declined' &&
      a.dismissedAt === undefined &&
      !view.miners.some((m) => m.characterIds.length > 1 && m.characterIds.includes(a.characterId))
  );
}

export function needsYouOf(
  view: BookView,
  data: Pick<BookData, 'uncounted' | 'disputes' | 'groupingAnswers'>,
  divisions: readonly number[],
  noticeRules: NoticeRules
) {
  const uncounted = uncountedToShow({ donations: data.uncounted ?? [] }, divisions);
  const disputes = disputesToShow(data.disputes ?? [], view.input.dismissals);
  const noticesDue = plannedNotices(view, noticeRules);
  const declined = declinedGroupings(view, data.groupingAnswers ?? []);
  const { needsYou } = view;
  return {
    needsYou,
    uncounted,
    disputes,
    noticesDue,
    declined,
    count:
      needsYou.length +
      uncounted.length +
      disputes.length +
      declined.length +
      (noticesDue.length > 0 ? 1 : 0),
  };
}

export function useNeedsYou() {
  const { view, data, settings } = useBook();
  return useMemo(
    () => needsYouOf(view, data, settings.divisions, settings.noticeRules),
    [view, data, settings.divisions, settings.noticeRules]
  );
}
