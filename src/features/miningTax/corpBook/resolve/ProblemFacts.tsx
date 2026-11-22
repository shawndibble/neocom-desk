import { useTranslation } from 'react-i18next';
import { useTimeZone } from '@/lib/timeFormat';
import { dateTimeAt } from '@/features/corp/moons/moonsFormat';
import { formatCount } from '@/lib/formatCount';
import { formatIsk } from '@/lib/isk';
import { isoDay } from '../memberFlag';
import type { ResolveTarget } from './targets';

const k = (key: string) => `miningTax.resolve.facts.${key}`;

/**
 * A fact's figure, exact: the Resolve dialog is where the member checks the money to the ISK, so
 * no shorthand (and no second, screen-reader copy of the figure in the sentence).
 */
const isk = (value: number) => formatIsk(value, 0);

/** What the app knows about a problem, above its choices: the figures, never advice. */
export function ProblemFacts({ target }: { target: ResolveTarget }) {
  const zone = useTimeZone();
  const { t } = useTranslation();
  const { problem } = target;
  const corp = problem.corpName;
  const row = problem.row;
  const bills = <p className="tabular-nums">{t(k('bills'), { amount: isk(row?.billed ?? 0) })}</p>;
  switch (problem.kind) {
    case 'uncredited':
      if (problem.held)
        return (
          <>
            <p>{t(k('inReview'), { corp, amount: isk(problem.amount) })}</p>
            <ul className="space-y-0.5 tabular-nums">
              {(target.donations ?? []).map((d) => (
                <li key={`${d.characterId}:${d.at}`}>
                  <span className="font-semibold">
                    {t(k('donation'), { amount: isk(d.amount) })}
                  </span>{' '}
                  · {dateTimeAt(d.at, zone)}
                  {d.refId !== undefined && ` · ${t(k('journalRef'), { ref: d.refId })}`}
                </li>
              ))}
            </ul>
          </>
        );
      return (
        <>
          <p>{t(k('uncredited'), { corp, amount: isk(problem.amount) })}</p>
          <ul className="space-y-0.5 tabular-nums">
            {(target.donations ?? []).map((d) => (
              <li key={`${d.characterId}:${d.at}`}>
                <span className="font-semibold">{t(k('donation'), { amount: isk(d.amount) })}</span>{' '}
                · {dateTimeAt(d.at, zone)}
                {d.refId !== undefined && ` · ${t(k('journalRef'), { ref: d.refId })}`}
                {d.covered.length > 0 && ` · ${t(k('paidDays'), { days: d.covered.join(', ') })}`}
              </li>
            ))}
          </ul>
        </>
      );
    case 'figure': {
      const d = row?.dispute;
      return (
        <>
          {d?.rate && (
            <p>
              {d.personalPct === undefined
                ? t(k('rateUnrecorded'), { corp, date: row?.date ?? '', book: d.bookPct })
                : t(k('rate'), {
                    corp,
                    date: row?.date ?? '',
                    book: d.bookPct,
                    yours: d.personalPct,
                  })}
            </p>
          )}
          {d?.quantity && (
            <p>
              {t(k('quantity'), {
                corp,
                date: row?.date ?? '',
                book: formatCount(d.bookQuantity),
                yours: formatCount(d.personalQuantity),
              })}
            </p>
          )}
          {bills}
        </>
      );
    }
    case 'conflict':
      return (
        <>
          <p>
            {t(k('conflict'), {
              corp,
              payee: target.payeeName ?? t(k('anotherPayee')),
              date: isoDay(row?.resolvesAt),
            })}
          </p>
          {bills}
        </>
      );
    case 'overdue':
      return (
        <>
          <p>{t(k('overdue'), { corp, period: problem.period })}</p>
          {target.declaration && (
            <>
              <p>
                {t(k('declarationRejected'), { corp, reason: target.declaration.reason ?? '' })}
              </p>
              {target.declaration.nextStep && (
                <p className="font-semibold text-text">
                  {t(k('nextStep'), { step: target.declaration.nextStep })}
                </p>
              )}
            </>
          )}
        </>
      );
    case 'billed':
      return bills;
    case 'kept':
      return (
        <>
          <p>
            {t(k(problem.by === 'declaration' ? 'declarationRejected' : 'kept'), {
              corp,
              date: row?.date ?? '',
              reason: problem.reason ?? '',
            })}
          </p>
          {problem.nextStep && (
            <p className="font-semibold text-text">
              {t(k('nextStep'), { step: problem.nextStep })}
            </p>
          )}
          {bills}
        </>
      );
  }
}
