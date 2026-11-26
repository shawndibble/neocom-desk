import { utcDayOf } from '../../../../functions/src/timeConstants';
import type { BookRowView } from '@/engine/corpTaxBook/personal';

export const answeredByMember = (view: Pick<BookRowView, 'flagged'>): boolean =>
  view.flagged?.state === 'sent' || view.flagged?.state === 'dismissed';

export const isoDay = (iso: string | undefined) => (iso ? utcDayOf(iso) : '');
