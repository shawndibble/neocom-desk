import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Caret } from '@/components/ui';
import { verifyRows, type VerifyPayload, type VerifyRow } from '@/engine/corpTaxBook/verifyView';
import { formatCount } from '@/lib/formatCount';
import { useOreNames } from './useOreNames';
import { isk, shortDate } from './statementFormat';

type OwedDay = NonNullable<NonNullable<VerifyPayload['account']>['owedDays']>[number];

/**
 * The days a Miner still owes, oldest first, one line each: the day, its refinery, what is left
 * of it (with the day's whole tax when part is paid). A day whose ore the Statement lists opens
 * to it; a day mined since has no lines to show and is a plain line. `earlier` is what older
 * Statements still owe beyond these days.
 */
export function OwedDayList({
  days,
  statement,
  earlier,
}: {
  days: readonly OwedDay[];
  statement: Pick<VerifyPayload['statement'], 'lines' | 'refineryNames'>;
  earlier: number;
}) {
  const { t, i18n } = useTranslation();
  const rows = useMemo(() => verifyRows(statement.lines), [statement.lines]);
  const oreNames = useOreNames(rows);
  const [open, setOpen] = useState<string | null>(null);
  const refinery = (id: number | undefined) =>
    id === undefined
      ? undefined
      : (statement.refineryNames?.[String(id)] ?? t('corpTaxBook.verify.refinery', { id }));
  return (
    <ul aria-label={t('corpTaxBook.verify.stillOwed')} className="divide-y divide-line">
      {days.map((d) => {
        const dayRows = rows.filter((r) => r.date === d.date);
        const expandable = dayRows.some((r) => r.ores.length > 0);
        const expanded = open === d.date;
        const place = refinery(dayRows[0]?.structureId);
        const head = (
          <>
            {expandable ? <Caret expanded={expanded} /> : <span className="w-4 shrink-0" />}
            <span className="w-24 shrink-0 font-medium">{shortDate(d.date, i18n.language)}</span>
            <span className="min-w-0 flex-1 truncate text-text-dim">{place}</span>
            {d.owed < d.tax && (
              <span className="shrink-0 text-xs text-text-dim">
                {t('corpTaxBook.verify.partOf', { tax: isk(d.tax) })}
              </span>
            )}
            <span className="shrink-0 font-semibold tabular-nums">{isk(d.owed)}</span>
          </>
        );
        return (
          <li key={d.date}>
            {expandable ? (
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : d.date)}
                className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-panel-2"
              >
                {head}
              </button>
            ) : (
              <div className="flex items-center gap-3 px-3 py-2 text-sm">{head}</div>
            )}
            {expanded && <DayOre rows={dayRows} oreNames={oreNames} />}
          </li>
        );
      })}
      {earlier > 0 && (
        <li className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
          <span className="pl-7 text-text-dim">{t('corpTaxBook.verify.earlierStatements')}</span>
          <span className="font-semibold tabular-nums">{isk(earlier)}</span>
        </li>
      )}
    </ul>
  );
}

/** One day's ore, each with its price, and its tax. */
function DayOre({
  rows,
  oreNames,
}: {
  rows: readonly VerifyRow[];
  oreNames: ReadonlyMap<number, string>;
}) {
  const { t } = useTranslation();
  return (
    <ul className="space-y-1 border-t border-line bg-panel-2 px-3 py-2 pl-10 text-sm">
      {rows.flatMap((r) =>
        r.ores.map((o) => (
          <li key={`${r.key}${o.typeId}`} className="flex justify-between gap-3 tabular-nums">
            <span>
              {oreNames.get(o.typeId) ?? `#${o.typeId}`} × {formatCount(o.quantity)}
            </span>
            <span className="text-text-dim">
              {o.unitPrice === undefined
                ? '—'
                : t('corpTaxBook.verify.each', { price: isk(o.unitPrice, 2) })}
            </span>
          </li>
        ))
      )}
      <li className="flex justify-between gap-3 border-t border-line pt-1 text-text-dim tabular-nums">
        <span>
          {rows[0]?.taxPct === undefined
            ? t('corpTaxBook.verify.tax')
            : t('corpTaxBook.verify.taxAt', { pct: rows[0].taxPct })}
        </span>
        <span>{isk(rows.reduce((sum, r) => sum + r.tax, 0))}</span>
      </li>
    </ul>
  );
}
