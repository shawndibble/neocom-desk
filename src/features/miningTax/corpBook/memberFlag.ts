import { utcDayOf } from '../../../../functions/src/timeConstants';
import type { BookRowView } from '@/engine/corpTaxBook/personal';

/**
 * Whether the member has already answered a Conflict day: told the corporation about it
 * (`sent`), or had an officer waive the disputed ore's tax (`dismissed`). `rejected` is not one
 * of these — the officer kept the bill and handed the day back, so it needs the member again.
 *
 * Kept here, free of React, so the Conflicts summary and the row's pill decide it from one
 * place: `MemberFlag['state']` is a closed union, so a fourth state would otherwise have to be
 * remembered in two files that cannot import each other.
 */
export const answeredByMember = (view: Pick<BookRowView, 'flagged'>): boolean =>
  view.flagged?.state === 'sent' || view.flagged?.state === 'dismissed';

/** A `YYYY-MM-DD` day from an ISO instant or date; empty when there is none. */
export const isoDay = (iso: string | undefined) => (iso ? utcDayOf(iso) : '');
