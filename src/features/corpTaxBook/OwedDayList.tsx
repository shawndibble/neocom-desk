import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Caret } from '@/components/ui';
import {
  focusRingInsetClassName,
  rowInteractiveClassName,
  tappableRowClassName,
} from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import {
  verifyRows,
  type UnpaidDay,
  type VerifyPayload,
  type VerifyRow,
} from '@/engine/corpTaxBook/verifyView';
import { formatCount } from '@/lib/formatCount';
import { useOreNames } from './useOreNames';
import { isk, shortDate } from './noticeFormat';

export function OwedDayList({
  days,
  notice,
}: {
  days: readonly UnpaidDay[];
  notice: Pick<VerifyPayload['statement'], 'lines' | 'refineryNames'>;
}) {
  const { t, i18n } = useTranslation();
  const rows = useMemo(() => verifyRows(notice.lines), [notice.lines]);
  const oreNames = useOreNames(rows);
  const [open, setOpen] = useState<string | null>(null);
  const refinery = (id: number | undefined) =>
    id === undefined
      ? undefined
      : (notice.refineryNames?.[String(id)] ?? t('corpTaxBook.verify.refinery', { id }));
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
                className={cx(
                  'flex w-full items-center gap-3 px-3 py-2 text-left text-sm',
                  rowInteractiveClassName,
                  focusRingInsetClassName,
                  tappableRowClassName
                )}
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
    </ul>
  );
}

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
