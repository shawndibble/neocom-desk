import { useTranslation } from 'react-i18next';
import { eveTimeLabel } from '@/engine/corpTaxBook/removalMail';
import { formatCount } from '@/lib/formatCount';
import { formatIsk } from '@/lib/isk';
import type { ResolveTarget } from './targets';

const k = (key: string) => `miningTax.resolve.facts.${key}`;
const isk = (n: number) => `${formatIsk(n, 0)} ISK`;

/** What the app knows about a problem, above its choices: the figures, never advice. */
export function ProblemFacts({ target }: { target: ResolveTarget }) {
  const { t } = useTranslation();
  const { problem } = target;
  const corp = problem.corpName;
  const row = problem.row;
  switch (problem.kind) {
    case 'uncredited':
      return (
        <>
          <p>{t(k('uncredited'), { corp, amount: isk(problem.amount) })}</p>
          <ul className="space-y-0.5 tabular-nums">
            {(target.donations ?? []).map((d) => (
              <li key={`${d.characterId}:${d.at}`}>
                <span className="font-semibold">{isk(d.amount)}</span> ·{' '}
                {eveTimeLabel(Date.parse(d.at))}
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
              {t(k('rate'), {
                corp,
                date: row?.date ?? '',
                book: d.bookPct,
                yours: d.personalPct ?? '?',
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
          <p className="tabular-nums">{t(k('bills'), { corp, amount: isk(row?.billed ?? 0) })}</p>
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
              date: (row?.resolvesAt ?? '').slice(0, 10),
            })}
          </p>
          <p className="tabular-nums">{t(k('bills'), { corp, amount: isk(row?.billed ?? 0) })}</p>
        </>
      );
    case 'kept':
      return (
        <>
          <p>{t(k('kept'), { corp, date: row?.date ?? '', reason: problem.reason ?? '' })}</p>
          {problem.nextStep && (
            <p className="font-semibold text-text">
              {t(k('nextStep'), { step: problem.nextStep })}
            </p>
          )}
        </>
      );
  }
}
