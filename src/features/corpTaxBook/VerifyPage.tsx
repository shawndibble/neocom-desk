import { formatCount } from '@/lib/formatCount';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Checkbox, EmptyState, Panel, Spinner, StatChip, StatChips } from '@/components/ui';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import * as Icon from '@/components/ui/icons';
import {
  dueDate,
  hasRecordOverride,
  ratesUsed,
  verifyRows,
  type VerifyPayload,
  type VerifyRow,
} from '@/engine/corpTaxBook/verifyView';
import { getCorporationPublicInfo } from '@/esi/endpoints/corp';
import { DEFAULT_OVERDUE_DAYS } from '@/engine/corpTaxBook/overdue';
import { callableErrorCode } from '@/features/communities/callableError';
import { loadTypeNames } from '@/features/character/typeNames';
import { cx } from '@/lib/cx';
import { formatIsk } from '@/lib/isk';

import { TRADE_HUBS } from '@/market/hubs';
import { GroupingQuestions } from './GroupingQuestions';
import { readVerifyStatement, setVerifyRemindersStopped } from './verifyApi';

const isk = (value: number, decimals = 0) => `${formatIsk(value, decimals)} ISK`;

type LoadState =
  | { status: 'loading' }
  | { status: 'ok'; payload: VerifyPayload }
  | { status: 'gone' }
  | { status: 'failed' };

/** An EVE/UTC date or instant as "15 Sep 2026". */
function shortDate(value: string, locale?: string): string {
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  return date.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function periodLabel(start: string, end: string, locale?: string): string {
  const from = new Date(`${start}T00:00:00Z`);
  const to = new Date(`${end}T00:00:00Z`);
  const fmt = (d: Date, opts: Intl.DateTimeFormatOptions) =>
    d.toLocaleDateString(locale, { ...opts, timeZone: 'UTC' });
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  // A whole calendar month reads as "Oct 2026"; any other period as "2–8 Oct 2026".
  if (sameMonth && start.endsWith('-01') && to.getUTCDate() === daysInMonth(to))
    return fmt(from, { month: 'short', year: 'numeric' });
  if (sameMonth)
    return `${from.getUTCDate()}–${fmt(to, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  return `${fmt(from, { day: 'numeric', month: 'short' })} – ${fmt(to, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })}`;
}

function daysInMonth(d: Date): number {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}

/** The cadence word for "Your weekly Statement still comes": from the book's setting, else the period's length. */
function cadenceKey(
  cadence: VerifyPayload['terms']['cadence'],
  start: string,
  end: string
): 'monthly' | 'weekly' | 'fortnightly' | 'regular' {
  if (cadence?.kind === 'monthly') return 'monthly';
  const days =
    cadence?.kind === 'days'
      ? cadence.days
      : Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 864e5) + 1;
  if (days === 7) return 'weekly';
  if (days === 14) return 'fortnightly';
  return days >= 28 && days <= 31 ? 'monthly' : 'regular';
}

/**
 * The guest verify page (issue #4066, D27, mockup step 19 option B): a
 * Statement's lines with their pricing, its terms with dates and the payments
 * credited, read with the link's token alone, no login and no Character. The
 * mail is minimal on purpose; this is where a miner checks every line.
 * Desktop: lines and payments left, Balance due / Terms / Stop reminders right.
 * Phone: Balance due, Terms, What you mined, Payments credited, Stop reminders.
 */
export function VerifyPage({ token }: { token: string }) {
  const { t } = useTranslation();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    readVerifyStatement(token).then(
      (payload) => {
        if (!cancelled) setState({ status: 'ok', payload });
      },
      (err: unknown) => {
        if (cancelled) return;
        const code = callableErrorCode(err);
        setState({
          status: code === 'not-found' || code === 'invalid-argument' ? 'gone' : 'failed',
        });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [token, attempt]);

  return (
    <div className="min-h-screen bg-bg text-text">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <span className="text-sm font-semibold">{t('share.brand')}</span>
        <span className="inline-flex items-center gap-1 text-xs text-text-dim">
          <Icon.ReadOnly size={Icon.ICON_SIZE.sm} aria-hidden="true" />
          {t('corpTaxBook.verify.readOnly')}
        </span>
      </div>
      <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
        {state.status === 'loading' && (
          <div className="flex justify-center py-10">
            <Spinner label={t('common.loading')} />
          </div>
        )}
        {state.status === 'gone' && (
          <>
            <h1 className="sr-only">{t('corpTaxBook.verify.title')}</h1>
            <EmptyState
              title={t('corpTaxBook.verify.goneTitle')}
              hint={t('corpTaxBook.verify.goneHint')}
            />
          </>
        )}
        {state.status === 'failed' && (
          <>
            <h1 className="sr-only">{t('corpTaxBook.verify.title')}</h1>
            <EmptyState
              title={t('corpTaxBook.verify.failedTitle')}
              hint={t('corpTaxBook.verify.failedHint')}
              action={
                <Button
                  size="sm"
                  onClick={() => {
                    setState({ status: 'loading' });
                    setAttempt((n) => n + 1);
                  }}
                >
                  {t('common.retry')}
                </Button>
              }
            />
          </>
        )}
        {state.status === 'ok' && <VerifyStatement token={token} payload={state.payload} />}
      </main>
    </div>
  );
}

function VerifyStatement({ token, payload }: { token: string; payload: VerifyPayload }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const { statement, terms, settlement } = payload;
  const rows = useMemo(() => verifyRows(statement.lines), [statement.lines]);

  const [corpName, setCorpName] = useState<string | undefined>(statement.corporationName);
  useEffect(() => {
    if (statement.corporationName) return;
    let cancelled = false;
    getCorporationPublicInfo(payload.corporationId).then(
      (result) => {
        if (!cancelled) setCorpName(result.data?.name);
      },
      () => undefined
    );
    return () => {
      cancelled = true;
    };
  }, [payload.corporationId, statement.corporationName]);
  const corp = corpName ?? t('corpTaxBook.verify.theCorp');

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

  const refinery = (id: number | undefined) =>
    id === undefined
      ? undefined
      : (statement.refineryNames?.[String(id)] ?? t('corpTaxBook.verify.refinery', { id }));

  const hub = TRADE_HUBS.find((h) => h.id === statement.hubId)?.systemName ?? statement.hubId;
  const overdueDays = terms.overdueDays ?? DEFAULT_OVERDUE_DAYS;
  const due = dueDate(statement.issuedAt, overdueDays);
  const credited = payload.payments.reduce((sum, p) => sum + p.amount, 0);
  const remaining = settlement?.remaining ?? Math.max(0, statement.amount - credited);
  const forgiven = settlement?.forgiven ?? 0;
  const dismissed = settlement ? settlement.credited - credited - forgiven : 0;
  const rates = ratesUsed(rows);

  const lastDeclaration = payload.declarations.at(-1);

  return (
    <>
      <header>
        <p className="text-xs tracking-widest text-text-dim uppercase">
          {t('corpTaxBook.verify.eyebrow', {
            corp,
            period: periodLabel(statement.periodStart, statement.periodEnd, locale),
            issued: shortDate(statement.issuedAt, locale),
          })}
        </p>
        <h1 className="text-xl font-semibold">
          {statement.minerName ?? t('corpTaxBook.verify.title')}
        </h1>
      </header>
      {payload.accountClosed && (
        <p className="rounded-xs border border-line p-3 text-sm" role="status">
          {t('corpTaxBook.verify.closed', { corp })}
        </p>
      )}
      {payload.pendingCharacterIds.length > 0 && (
        <GroupingQuestions
          token={token}
          corporationId={payload.corporationId}
          corp={corp}
          characterIds={payload.pendingCharacterIds}
        />
      )}
      <div className="flex flex-col gap-4 md:grid md:grid-cols-[minmax(0,1fr)_22rem] md:grid-rows-[auto_auto_minmax(0,1fr)] md:items-start">
        <div className="order-3 min-w-0 space-y-4 md:order-none md:col-start-1 md:row-span-3 md:row-start-1">
          <Panel
            title={t('corpTaxBook.verify.mined')}
            meta={
              <span className="text-xs text-text-dim max-md:basis-full">
                {t('corpTaxBook.verify.minedMeta', {
                  hub,
                  form: t(`corpTaxBook.verify.oreForm.${statement.oreForm}`),
                })}
              </span>
            }
            padded={false}
            wrapMeta
          >
            <ul aria-label={t('corpTaxBook.verify.linesLabel')} className="divide-y divide-line">
              {rows.map((r) => (
                <MinedDay
                  key={r.key}
                  row={r}
                  oreNames={oreNames}
                  refineryName={refinery(r.structureId)}
                  locale={locale}
                />
              ))}
            </ul>
            <p className="border-t border-line px-3 py-2 text-right text-sm tabular-nums">
              {t('corpTaxBook.verify.billed')}{' '}
              <span className="font-semibold">{isk(statement.amount)}</span>
            </p>
          </Panel>
          <Panel
            title={t('corpTaxBook.verify.paymentsTitle')}
            padded={payload.payments.length === 0}
          >
            {payload.payments.length === 0 ? (
              <p className="text-sm text-text-dim">{t('corpTaxBook.verify.noPayments')}</p>
            ) : (
              <ul
                aria-label={t('corpTaxBook.verify.paymentsTitle')}
                className="divide-y divide-line"
              >
                {payload.payments.map((p) => (
                  <li
                    key={p.id}
                    className="flex justify-between gap-3 px-3 py-2 text-sm tabular-nums"
                  >
                    <span>
                      {shortDate(p.at, locale)}
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
        </div>
        <Panel className="order-1 md:order-none md:col-start-2 md:row-start-1">
          <StatChips>
            <StatChip
              label={t('corpTaxBook.verify.balanceDue')}
              value={isk(remaining)}
              tone={remaining > 0 ? 'danger' : 'success'}
              emphasis
            />
          </StatChips>
          <p className="mt-2 text-sm tabular-nums">
            {t('corpTaxBook.verify.balanceSum', {
              billed: isk(statement.amount),
              paid: isk(credited),
            })}
            {dismissed > 0 && <> {t('corpTaxBook.verify.dismissed', { amount: isk(dismissed) })}</>}
            {forgiven > 0 && <> {t('corpTaxBook.verify.forgiven', { amount: isk(forgiven) })}</>}
            {settlement && settlement.writtenOff > 0 && (
              <> {t('corpTaxBook.verify.writtenOff', { amount: isk(settlement.writtenOff) })}</>
            )}
          </p>
          {remaining > 0 && (
            <p className="mt-2 text-sm">
              {t('corpTaxBook.verify.howToPay', { corp })} {t('corpTaxBook.verify.payCodeLead')}{' '}
              <span className="font-mono">{statement.code}</span>{' '}
              {t('corpTaxBook.verify.payCodeTail')}
            </p>
          )}
          {payload.settled && remaining === 0 && (
            <p className="mt-2 text-sm text-text-dim">{t('corpTaxBook.verify.settled')}</p>
          )}
          {lastDeclaration && (
            <p className="mt-2 text-xs text-text-dim">
              {t('corpTaxBook.verify.declaration', {
                corp,
                date: shortDate(lastDeclaration.at, locale),
              })}{' '}
              {lastDeclaration.resolution ?? t('corpTaxBook.verify.declarationPending')}
            </p>
          )}
        </Panel>
        <Panel
          title={t('corpTaxBook.verify.termsTitle')}
          className="order-2 md:order-none md:col-start-2 md:row-start-2"
        >
          <dl className="space-y-2 text-sm">
            <Term label={t('corpTaxBook.verify.term.rate')}>
              {rates.length === 0
                ? '—'
                : rates.map((r) => (
                    <span key={`${r.pct}${r.effectiveFrom}`} className="block">
                      {r.effectiveFrom
                        ? t('corpTaxBook.verify.rateFrom', {
                            pct: r.pct,
                            date: shortDate(r.effectiveFrom, locale),
                          })
                        : t('corpTaxBook.verify.rateNoDate', { pct: r.pct })}
                    </span>
                  ))}
              {hasRecordOverride(rows) && (
                <span className="block text-xs text-text-dim">
                  {t('corpTaxBook.verify.rateOverride')}
                </span>
              )}
            </Term>
            <Term label={t('corpTaxBook.verify.term.price')}>
              {t('corpTaxBook.verify.priceBasis', {
                hub,
                form: t(`corpTaxBook.verify.oreForm.${statement.oreForm}`),
              })}
            </Term>
            <Term label={t('corpTaxBook.verify.term.due')}>
              {t('corpTaxBook.verify.dueValue', {
                date: shortDate(due, locale),
                days: overdueDays,
              })}
            </Term>
            {terms.minimumStatement !== undefined && (
              <Term label={t('corpTaxBook.verify.term.minimum')}>
                {t('corpTaxBook.verify.minimumValue', {
                  amount: isk(terms.minimumStatement),
                })}
              </Term>
            )}
            <Term label={t('corpTaxBook.verify.term.paying')}>
              {t('corpTaxBook.verify.payingValue', { corp })}
            </Term>
          </dl>
        </Panel>
        <div className="order-4 md:order-none md:col-start-2 md:row-start-3">
          <StopReminders
            token={token}
            initial={payload.remindersStopped}
            cadence={cadenceKey(terms.cadence, statement.periodStart, statement.periodEnd)}
          />
        </div>
      </div>
    </>
  );
}

/** The segments of a day's meta line, with empty ones (an unnamed refinery, no rate) dropped. */
function metaSegments(parts: readonly (string | undefined | false)[]): string[] {
  return parts.filter((p): p is string => typeof p === 'string' && p.trim() !== '');
}

/**
 * One mined day: the day, refinery, rate and the day's tax once, then one
 * sub-row per ore (ore × quantity, its unit price, the price's date and source)
 * so every price sits beside its own ore.
 */
function MinedDay({
  row: r,
  oreNames,
  refineryName,
  locale,
}: {
  row: VerifyRow;
  oreNames: ReadonlyMap<number, string>;
  refineryName: string | undefined;
  locale: string;
}) {
  const { t } = useTranslation();
  const segments = metaSegments([
    shortDate(r.date, locale),
    refineryName,
    r.kind === 'late-ore' && t('corpTaxBook.verify.lateOre'),
    r.taxPct === undefined ? undefined : `${r.taxPct}%`,
  ]);
  return (
    <li className="px-3 py-2 text-sm">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 text-text-dim">
          {r.ores.length === 0 && (
            <span className="text-text">
              {r.kind === 'correction'
                ? t('corpTaxBook.verify.correction')
                : t('corpTaxBook.verify.lateOre')}
              {' · '}
            </span>
          )}
          {segments.map((seg, i) => (
            <span key={`${i}${seg}`}>
              {i > 0 && <span aria-hidden="true"> · </span>}
              <span>{seg}</span>
            </span>
          ))}
        </span>
        <span className="shrink-0 font-semibold tabular-nums">{isk(r.tax)}</span>
      </div>
      {r.reason && <p className="text-xs text-text-dim">{r.reason}</p>}
      {r.ores.length > 0 && (
        <ul className="mt-1 space-y-1">
          {r.ores.map((o) => (
            <li
              key={o.typeId}
              className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 md:grid-cols-[minmax(0,1fr)_10rem_14rem]"
            >
              <span>
                {oreNames.get(o.typeId) ?? `#${o.typeId}`} × {formatCount(o.quantity)}
              </span>
              <span className="text-right tabular-nums">
                {o.unitPrice === undefined ? '—' : isk(o.unitPrice, 2)}
              </span>
              <span className="col-span-2 text-xs text-text-dim md:col-span-1 md:text-right">
                {metaSegments([
                  shortDate(r.date, locale),
                  o.source &&
                    (o.source === 'saved'
                      ? t('corpTaxBook.verify.priceSaved')
                      : t(`miningTax.detail.breakdown.source.${o.source}`)),
                ]).join(' · ')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function Term({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-text-dim">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** The one thing a miner can change here: the next Statement still comes either way. */
function StopReminders({
  token,
  initial,
  cadence,
}: {
  token: string;
  initial: boolean;
  cadence: ReturnType<typeof cadenceKey>;
}) {
  const { t } = useTranslation();
  const [stopped, setStopped] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  async function toggle(next: boolean) {
    setSaving(true);
    setFailed(false);
    try {
      setStopped(await setVerifyRemindersStopped(token, next));
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-1">
      <label
        className={cx(
          'flex cursor-pointer items-start gap-3 rounded-xs border border-line p-3',
          tappableRowClassName
        )}
      >
        <Checkbox
          checked={stopped}
          disabled={saving}
          onChange={(e) => void toggle(e.target.checked)}
          className="mt-0.5"
        />
        <span className="text-sm">
          {t('corpTaxBook.verify.stop.label')}
          <span className="block text-xs text-text-dim">
            {t('corpTaxBook.verify.stop.hint', {
              cadence: t(`corpTaxBook.verify.cadence.${cadence}`),
            })}
          </span>
        </span>
      </label>
      {failed && (
        <p role="alert" className="text-xs text-danger">
          {t('corpTaxBook.verify.stop.failed')}
        </p>
      )}
    </div>
  );
}
