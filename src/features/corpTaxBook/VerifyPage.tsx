import { useEffect, useMemo, useState } from 'react';
import { InlineError } from '@/components/ui/InlineError';
import { useTranslation } from 'react-i18next';
import { Button, Checkbox, EmptyState, Panel, Spinner } from '@/components/ui';
import { STAT_CHIP_TONE_TEXT_CLASS } from '@/components/ui/statChipTone';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import * as Icon from '@/components/ui/icons';
import {
  hasRecordOverride,
  ratesUsed,
  verifyRows,
  type VerifyPayload,
} from '@/engine/corpTaxBook/verifyView';
import { getCorporationPublicInfo } from '@/esi/endpoints/corp';
import { callableErrorCode } from '@/features/communities/callableError';
import { cx } from '@/lib/cx';
import { readDivisionNames } from '@/engine/corpTaxBook/divisionNames';
import { corpPayAccounts } from '@/features/miningTax/corpBook/corpPayAccount';
import { writeToClipboard } from '@/lib/clipboard';
import { ShareShell } from '@/features/share/ShareShell';
import { GroupingQuestions } from './GroupingQuestions';
import { OwedDayList } from './OwedDayList';
import { NoticeLines } from './NoticeLines';
import { VerifyLedger } from './VerifyLedger';
import { isk, shortDate } from './noticeFormat';
import { readVerifyNotice, setVerifyRemindersStopped } from './verifyApi';

type LoadState =
  | { status: 'loading' }
  | { status: 'ok'; payload: VerifyPayload }
  | { status: 'gone' }
  | { status: 'failed' };

/**
 * The guest verify page (issue #4066, D27): a late notice read with the link's token alone, no
 * login and no Character. It leads with what the Miner's Running account owes now and how to pay,
 * lists only the days still owed (one line each, opening to its ore), and keeps every day and
 * payment in a Ledger that stays closed until asked for. A notice whose account the officer's
 * client has not counted lists its own lines instead.
 */
export function VerifyPage({ token }: { token: string }) {
  const { t } = useTranslation();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    readVerifyNotice(token).then(
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
    <ShareShell title={t('corpTaxBook.verify.title')} wide>
      {state.status === 'loading' && (
        <div className="flex justify-center py-10">
          <Spinner label={t('common.loading')} />
        </div>
      )}
      {state.status === 'gone' && (
        <EmptyState
          title={t('corpTaxBook.verify.goneTitle')}
          hint={t('corpTaxBook.verify.goneHint')}
        />
      )}
      {state.status === 'failed' && (
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
      )}
      {state.status === 'ok' && <VerifyNotice token={token} payload={state.payload} />}
    </ShareShell>
  );
}

function VerifyNotice({ token, payload }: { token: string; payload: VerifyPayload }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  // The wire still names the late notice `statement`, in the shape older servers stored it.
  const { statement: notice, terms } = payload;
  const rows = useMemo(() => verifyRows(notice.lines), [notice.lines]);

  const [corpName, setCorpName] = useState<string | undefined>(notice.corporationName);
  useEffect(() => {
    if (notice.corporationName) return;
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
  }, [payload.corporationId, notice.corporationName]);
  const corp = corpName ?? t('corpTaxBook.verify.theCorp');

  // What the Miner's account owes now; the notice's own figure stands in until an officer's tab
  // has counted the account. Money pays the oldest day first: no payment is this notice's own.
  const account = payload.account ?? null;
  const owing = account ? account.owed : notice.amount;
  const rates = ratesUsed(rows);
  // The days still owed, when the officer's client recorded them: the page then lists those and
  // keeps everything paid in the ledger, instead of every line of this notice. When they do not
  // add up to what is owed (a few ISK of rounding aside), the page keeps the notice's lines.
  const recordedDays = account?.unpaidDays;
  const unpaidSum = recordedDays?.reduce((sum, d) => sum + d.owed, 0) ?? 0;
  const unpaidDays =
    recordedDays && owing - unpaidSum <= recordedDays.length + 1 ? recordedDays : undefined;
  // Days mined since the last notice are on no notice: the recorded days add them to the ledger.
  const ledger = useMemo(() => {
    const known = new Set(payload.ledger.days.map((d) => d.date));
    const days = [
      ...payload.ledger.days,
      ...(unpaidDays ?? [])
        .filter((d) => !known.has(d.date))
        .map((d) => ({ date: d.date, tax: d.tax })),
    ];
    return { ...payload.ledger, days };
  }, [payload.ledger, unpaidDays]);

  const lastDeclaration = payload.declarations.at(-1);
  // The wallet divisions the book reads (#6204). Only a book that reads past the Master Wallet has
  // a choice to name: a donation from outside the corporation has no division to pick.
  const divisionNames = readDivisionNames(terms.divisionNames);
  const wallet =
    terms.divisions.length > 0 && !(terms.divisions.length === 1 && terms.divisions[0] === 1)
      ? corpPayAccounts(terms.divisions, divisionNames, t).join(', ')
      : null;

  return (
    <>
      <header>
        <p className="text-xs tracking-widest text-text-dim uppercase">
          {t('corpTaxBook.verify.eyebrowNotice', {
            corp,
            issued: shortDate(notice.issuedAt, locale),
          })}
        </p>
        <p className="text-xl font-semibold">{notice.minerName ?? t('corpTaxBook.verify.title')}</p>
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
      <div className={cx('grid gap-4', owing > 0 && 'md:grid-cols-2')}>
        <Panel title={t('corpTaxBook.verify.owedNow')}>
          <p
            className={cx(
              'text-3xl font-semibold tabular-nums',
              STAT_CHIP_TONE_TEXT_CLASS[owing > 0 ? 'danger' : 'success']
            )}
          >
            {isk(owing)}
          </p>
          {account && (
            <p className="mt-1 text-sm text-text-dim">
              {account.owed > 0 && account.oldest
                ? t('corpTaxBook.verify.owedDays', {
                    count: account.days,
                    date: shortDate(account.oldest, locale),
                  })
                : account.paidThrough
                  ? t('corpTaxBook.verify.paidUpThrough', {
                      corp,
                      date: shortDate(account.paidThrough, locale),
                    })
                  : t('corpTaxBook.verify.paidUp', { corp })}
            </p>
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
        {owing > 0 && (
          <Panel title={t('corpTaxBook.verify.payTitle')}>
            <dl className="space-y-2 text-sm">
              <PayField
                label={t('corpTaxBook.verify.payTo')}
                value={corp}
                copyable={Boolean(corpName)}
              />
              {wallet && (
                <div>
                  <dt className="text-xs text-text-dim">{t('corpTaxBook.verify.payWallet')}</dt>
                  <dd>
                    {wallet}
                    <span className="block text-xs text-text-dim">
                      {t('corpTaxBook.verify.payWalletHint')}
                    </span>
                  </dd>
                </div>
              )}
              <PayField
                label={t('corpTaxBook.verify.payReason')}
                value={notice.code}
                mono
                copyable
              />
            </dl>
            <p className="mt-3 text-xs text-text-dim">{t('corpTaxBook.verify.payNoteNotice')}</p>
          </Panel>
        )}
      </div>
      {unpaidDays ? (
        <>
          {owing > 0 && (
            <Panel
              title={t('corpTaxBook.verify.stillOwed')}
              meta={
                <span className="text-xs text-text-dim">{t('corpTaxBook.verify.oldestFirst')}</span>
              }
              padded={false}
            >
              <OwedDayList days={unpaidDays} notice={notice} />
            </Panel>
          )}
          <VerifyLedger ledger={ledger} />
        </>
      ) : (
        <>
          <NoticeLines notice={notice} />
          {rates.length > 0 && (
            <p className="text-xs text-text-dim">
              {t('corpTaxBook.verify.rate')}:{' '}
              {rates
                .map((r) =>
                  r.effectiveFrom
                    ? t('corpTaxBook.verify.rateFrom', {
                        pct: r.pct,
                        date: shortDate(r.effectiveFrom, locale),
                      })
                    : t('corpTaxBook.verify.rateNoDate', { pct: r.pct })
                )
                .join(' · ')}
              {hasRecordOverride(rows) && <> {t('corpTaxBook.verify.rateOverride')}</>}
            </p>
          )}
        </>
      )}
      <StopReminders token={token} initial={payload.remindersStopped} />
    </>
  );
}

/** A label and its value, with a Copy button so the pilot can paste it into EVE's transfer window. */
function PayField({
  label,
  value,
  mono = false,
  copyable,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copyable: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <dt className="text-xs text-text-dim">{label}</dt>
        <dd className={cx('break-words', mono && 'font-mono')}>{value}</dd>
      </div>
      {copyable && <CopyButton text={value} label={label} />}
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const { t } = useTranslation();
  const [outcome, setOutcome] = useState<'copied' | 'failed' | null>(null);
  useEffect(() => {
    if (outcome === null) return;
    const timer = setTimeout(() => setOutcome(null), 2000);
    return () => clearTimeout(timer);
  }, [outcome]);
  return (
    <Button
      size="sm"
      aria-label={`${t('corpTaxBook.verify.copy')} ${label}`}
      onClick={() =>
        writeToClipboard(text).then(
          () => setOutcome('copied'),
          () => setOutcome('failed')
        )
      }
    >
      {outcome === null && <Icon.CopyToClipboard aria-hidden />}
      {outcome === 'copied'
        ? t('corpTaxBook.verify.copied')
        : outcome === 'failed'
          ? t('corpTaxBook.verify.copyFailed')
          : t('corpTaxBook.verify.copy')}
    </Button>
  );
}

/** The one thing a miner can change here: a late notice still comes if they fall behind. */
function StopReminders({ token, initial }: { token: string; initial: boolean }) {
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
          <span className="block text-xs text-text-dim">{t('corpTaxBook.verify.stop.hint')}</span>
        </span>
      </label>
      {failed && <InlineError>{t('corpTaxBook.verify.stop.failed')}</InlineError>}
    </div>
  );
}
