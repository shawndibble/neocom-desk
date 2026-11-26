import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Panel } from '@/components/ui';
import {
  verifyRows,
  type VerifyPayloadLine,
  type VerifyRow,
} from '@/engine/corpTaxBook/verifyView';
import { formatCount } from '@/lib/formatCount';
import { TRADE_HUBS } from '@/market/hubs';
import { useOreNames } from './useOreNames';
import { isk, shortDate } from './noticeFormat';

export interface NoticeLinesSource {
  lines: readonly VerifyPayloadLine[];
  hubId: string;
  oreForm: 'compressed' | 'raw';
  amount: number;
  refineryNames?: Record<string, string>;
}

type DateFormat = (value: string) => string;

export function NoticeLines({
  notice: statement,
  formatDate,
  title,
}: {
  notice: NoticeLinesSource;
  formatDate?: DateFormat;
  title?: string;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const fmt: DateFormat = formatDate ?? ((v) => shortDate(v, locale));
  const rows = useMemo(() => verifyRows(statement.lines), [statement.lines]);
  const oreNames = useOreNames(rows);
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
  return (
    <div className="@container">
      <Panel
        title={title ?? t('corpTaxBook.verify.mined')}
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

interface DayGroup {
  date: string;
  rows: VerifyRow[];
  tax: number;
}

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

function metaSegments(parts: readonly (string | undefined | false)[]): string[] {
  return parts.filter((p): p is string => typeof p === 'string' && p.trim() !== '');
}

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
  const priceSource = (source: VerifyRow['ores'][number]['source']) =>
    source && source !== 'saved' && source !== 'historical'
      ? t(`miningTax.detail.breakdown.source.${source}`)
      : undefined;
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
