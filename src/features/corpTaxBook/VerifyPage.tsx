import { useEffect, useMemo, useState } from 'react';
import { InlineError } from '@/components/ui/InlineError';
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
} from '@/engine/corpTaxBook/verifyView';
import { getCorporationPublicInfo } from '@/esi/endpoints/corp';
import { DEFAULT_OVERDUE_DAYS } from '@/engine/corpTaxBook/overdue';
import { callableErrorCode } from '@/features/communities/callableError';
import { cx } from '@/lib/cx';

import { TRADE_HUBS } from '@/market/hubs';
import { GroupingQuestions } from './GroupingQuestions';
import { StatementLines, StatementPayments } from './StatementBody';
import { isk, shortDate } from './statementFormat';
import { verifyPeriodLabel as periodLabel } from './verifyPeriodLabel';
import { readVerifyStatement, setVerifyRemindersStopped } from './verifyApi';

type LoadState =
  | { status: 'loading' }
  | { status: 'ok'; payload: VerifyPayload }
  | { status: 'gone' }
  | { status: 'failed' };

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
          <StatementLines statement={statement} />
          <StatementPayments payments={payload.payments} />
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
      {failed && <InlineError>{t('corpTaxBook.verify.stop.failed')}</InlineError>}
    </div>
  );
}
