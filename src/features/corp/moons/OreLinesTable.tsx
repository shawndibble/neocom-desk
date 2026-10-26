import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { OTHER_ORE_TYPE_ID, type OreTaxLine } from '@/engine/corpTaxBook/bookSections';
import { formatCount } from '@/lib/formatCount';
import { useIsPhone } from '@/lib/useIsPhone';
import { isk } from './moonsFormat';
import { useBook } from './useBook';

/**
 * What an opened row says: one line per ore (amount, estimated value, tax) and, unless `showTotal` is off, a total line.
 * On a phone each ore is one labelled line instead of a four-column table.
 * `foot` is the row's one link ("Open miner", "Open page"), set apart under the lines.
 */
export function OreLinesTable({
  lines,
  label,
  foot,
  showTotal = true,
}: {
  lines: readonly OreTaxLine[];
  label: string;
  foot?: ReactNode;
  /** Off where the opened row's own cells already carry the totals (the Moon page's Miner rows). */
  showTotal?: boolean;
}) {
  const { t } = useTranslation();
  const { names } = useBook();
  const total = lines.reduce(
    (s, l) => ({ q: s.q + l.quantity, v: s.v + l.value, t: s.t + l.tax }),
    { q: 0, v: 0, t: 0 }
  );
  const phone = useIsPhone();
  const oreName = (l: OreTaxLine) =>
    l.typeId === OTHER_ORE_TYPE_ID ? t('corpTaxBook.moons.sections.otherOre') : names.ore(l.typeId);
  const oreLine = (q: number, v: number, x: number) =>
    t('corpTaxBook.moons.sections.oreLine', {
      amount: formatCount(q),
      value: isk(v),
      tax: isk(x),
    });
  if (phone)
    return (
      <div className="space-y-2 p-3">
        <ul className="space-y-1.5 text-sm" aria-label={label}>
          {lines.map((l) => (
            <li key={l.typeId}>
              <span className="font-semibold">{oreName(l)}</span>
              <span className="block text-xs text-text-dim tabular-nums">
                {oreLine(l.quantity, l.value, l.tax)}
              </span>
            </li>
          ))}
          {showTotal && (
            <li className="border-t border-line pt-1.5">
              <span className="font-semibold">{t('corpTaxBook.moons.sections.total')}</span>
              <span className="block text-xs text-text-dim tabular-nums">
                {oreLine(total.q, total.v, total.t)}
              </span>
            </li>
          )}
        </ul>
        {foot && <div className="text-sm">{foot}</div>}
      </div>
    );
  const head = `${eyebrowClassName} py-1 font-normal`;
  return (
    <div className="space-y-2 p-3">
      <table className="w-full text-sm tabular-nums" aria-label={label}>
        <thead>
          <tr className="text-left">
            <th className={head}>{t('corpTaxBook.moons.cols.ore')}</th>
            <th className={`${head} text-right`}>{t('corpTaxBook.moons.cols.amount')}</th>
            <th className={`${head} text-right`}>{t('corpTaxBook.moons.cols.estValue')}</th>
            <th className={`${head} pr-4 text-right`}>{t('corpTaxBook.moons.cols.tax')}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.typeId}>
              <td className="py-0.5 pr-2 font-sans">{oreName(l)}</td>
              <td className="py-0.5 text-right">{formatCount(l.quantity)}</td>
              <td className="py-0.5 text-right">{isk(l.value)}</td>
              <td className="py-0.5 pr-4 text-right">{isk(l.tax)}</td>
            </tr>
          ))}
        </tbody>
        {showTotal && (
          <tfoot>
            <tr className="border-t border-line font-semibold">
              <td className="py-1 pr-2 font-sans">{t('corpTaxBook.moons.sections.total')}</td>
              <td className="py-1 text-right">{formatCount(total.q)}</td>
              <td className="py-1 text-right">{isk(total.v)}</td>
              <td className="py-1 pr-4 text-right">{isk(total.t)}</td>
            </tr>
          </tfoot>
        )}
      </table>
      {foot && <div className="text-sm">{foot}</div>}
    </div>
  );
}
