import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Panel } from '@/components/ui';
import {
  verifyRows,
  type VerifyPayload,
  type VerifyPayloadLine,
  type VerifyRow,
} from '@/engine/corpTaxBook/verifyView';
import { loadTypeNames } from '@/features/character/typeNames';
import { formatCount } from '@/lib/formatCount';
import { TRADE_HUBS } from '@/market/hubs';
import { isk, shortDate } from './statementFormat';

/** What the lines panel prints: a Statement as the verify page reads it, or the book holds it. */
export interface StatementLinesSource {
  lines: readonly VerifyPayloadLine[];
  hubId: string;
  oreForm: 'compressed' | 'raw';
  amount: number;
  refineryNames?: Record<string, string>;
}

/** Formats a date for the page it sits on; the verify page's own is the default. */
type DateFormat = (value: string) => string;

/** The mined days of one Statement with every ore's price, and the billed total (shared by the verify page and the officer's Statement panel). */
export function StatementLines({
  statement,
  formatDate,
}: {
  statement: StatementLinesSource;
  formatDate?: DateFormat;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const fmt: DateFormat = formatDate ?? ((v) => shortDate(v, locale));
  const rows = useMemo(() => verifyRows(statement.lines), [statement.lines]);
  const [oreNames, setOreNames] = useState<ReadonlyMap<number, string>>(new Map());
  useEffect(() => {
    const ids = rows.flatMap((r) => r.ores.map((o) => o.typeId));
    if (ids.length === 0) return;
    let cancelled = false;
    loadTypeNames(ids).then(
      (names) => {
        if (!cancelled) setOreNames(names);
      },
      () => undefined
    );
    return () => {
      cancelled = true;
    };
  }, [rows]);
  const days = useMemo(() => groupByDay(rows), [rows]);
  const refinery = (id: number | undefined) =>
    id === undefined
      ? undefined
      : (statement.refineryNames?.[String(id)] ?? t('corpTaxBook.verify.refinery', { id }));
  const hub = TRADE_HUBS.find((h) => h.id === statement.hubId)?.systemName ?? statement.hubId;
  const minedMeta = t('corpTaxBook.verify.minedMeta', {
    hub,
    form: t(`corpTaxBook.verify.oreForm.${statement.oreForm}`),
  });
  // The panel is narrow at any viewport width: the meta moves under the title by the
  // container's width, not the viewport's.
  return (
    <div className="@container">
      <Panel
        title={t('corpTaxBook.verify.mined')}
        meta={<span className="hidden text-xs text-text-dim @md:inline">{minedMeta}</span>}
        padded={false}
      >
        <p className="border-b border-line px-3 py-2 text-xs text-text-dim @md:hidden">
          {minedMeta}
        </p>
        <ul aria-label={t('corpTaxBook.verify.linesLabel')} className="divide-y divide-line">
          {days.map((day) => (
            <MinedDay
              key={day.date}
              day={day}
              oreNames={oreNames}
              refinery={refinery}
              formatDate={fmt}
            />
          ))}
        </ul>
        <p className="border-t border-line px-3 py-2 text-right text-sm tabular-nums">
          {t('corpTaxBook.verify.billed')}{' '}
          <span className="font-semibold">{isk(statement.amount)}</span>
        </p>
      </Panel>
    </div>
  );
}

/** The payments credited to a Statement, or the line saying none have been. */
export function StatementPayments({
  payments,
  formatDate,
}: {
  payments: VerifyPayload['payments'];
  formatDate?: DateFormat;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  return (
    <Panel title={t('corpTaxBook.verify.paymentsTitle')} padded={payments.length === 0}>
      {payments.length === 0 ? (
        <p className="text-sm text-text-dim">{t('corpTaxBook.verify.noPayments')}</p>
      ) : (
        <ul aria-label={t('corpTaxBook.verify.paymentsTitle')} className="divide-y divide-line">
          {payments.map((p) => (
            <li key={p.id} className="flex justify-between gap-3 px-3 py-2 text-sm tabular-nums">
              <span>
                {(formatDate ?? ((v) => shortDate(v, locale)))(p.at)}
                <span className="block text-xs text-text-dim">
                  {t(`corpTaxBook.verify.source.${p.source}`)}
                </span>
              </span>
              <span className="text-isk-pos">+{isk(p.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

interface DayGroup {
  date: string;
  rows: VerifyRow[];
  tax: number;
}

/** Consecutive rows of the same day, so a day is named once however many lines it bills. */
function groupByDay(rows: readonly VerifyRow[]): DayGroup[] {
  const days: DayGroup[] = [];
  for (const r of rows) {
    const last = days[days.length - 1];
    if (last && last.date === r.date) {
      last.rows.push(r);
      last.tax += r.tax;
    } else {
      days.push({ date: r.date, rows: [r], tax: r.tax });
    }
  }
  return days;
}

/** The segments of a line's meta, with empty ones (an unnamed refinery, no rate) dropped. */
function metaSegments(parts: readonly (string | undefined | false)[]): string[] {
  return parts.filter((p): p is string => typeof p === 'string' && p.trim() !== '');
}

/**
 * One mined day: the day and its tax once, then for each line the refinery (named
 * on the line under the day, again only when it changes) and the rate, and one
 * sub-row per ore (ore × quantity, its unit price, the price's source) so every
 * price sits beside its own ore.
 */
function MinedDay({
  day,
  oreNames,
  refinery,
  formatDate,
}: {
  day: DayGroup;
  oreNames: ReadonlyMap<number, string>;
  refinery: (id: number | undefined) => string | undefined;
  formatDate: DateFormat;
}) {
  const { t } = useTranslation();
  // The day header already says the day, and the panel header says prices are the day's own:
  // an ore line only speaks up when its price came from somewhere else.
  const priceSource = (source: VerifyRow['ores'][number]['source']) =>
    source && source !== 'saved' ? t(`miningTax.detail.breakdown.source.${source}`) : undefined;
  const many = day.rows.length > 1;
  return (
    <li className="px-3 py-2 text-sm">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 font-medium">{formatDate(day.date)}</span>
        <span className="shrink-0 font-semibold tabular-nums">{isk(day.tax)}</span>
      </div>
      {day.rows.map((r, i) => {
        const segments = metaSegments([
          r.ores.length === 0 &&
            (r.kind === 'correction'
              ? t('corpTaxBook.verify.correction')
              : t('corpTaxBook.verify.lateOre')),
          i === 0 || day.rows[i - 1].structureId !== r.structureId
            ? refinery(r.structureId)
            : undefined,
          r.ores.length > 0 && r.kind === 'late-ore' && t('corpTaxBook.verify.lateOre'),
          r.taxPct === undefined ? undefined : `${r.taxPct}%`,
        ]);
        return (
          <div key={r.key} className="mt-1">
            {(segments.length > 0 || many) && (
              <div className="flex items-baseline justify-between gap-3 text-text-dim">
                <span className="min-w-0">
                  {segments.map((seg, k) => (
                    <span key={`${k}${seg}`}>
                      {k > 0 && <span aria-hidden="true"> · </span>}
                      <span>{seg}</span>
                    </span>
                  ))}
                </span>
                {many && <span className="shrink-0 tabular-nums">{isk(r.tax)}</span>}
              </div>
            )}
            {r.reason && <p className="text-xs text-text-dim">{r.reason}</p>}
            {r.ores.length > 0 && (
              <ul className="mt-1 space-y-1">
                {r.ores.map((o) => (
                  <li
                    key={o.typeId}
                    className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 @md:grid-cols-[minmax(0,1fr)_10rem_14rem]"
                  >
                    <span>
                      {oreNames.get(o.typeId) ?? `#${o.typeId}`} × {formatCount(o.quantity)}
                    </span>
                    <span className="text-right tabular-nums">
                      {o.unitPrice === undefined ? '—' : isk(o.unitPrice, 2)}
                    </span>
                    {priceSource(o.source) && (
                      <span className="col-span-2 text-xs text-text-dim @md:col-span-1 @md:text-right">
                        {priceSource(o.source)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </li>
  );
}
