import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Button,
  Panel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatChip,
  StatChips,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { nextRunPeriod, planStatementRun, statementForLine } from '@/engine/corpTaxBook/bookView';
import { mailableAfterClose } from '@/engine/corpTaxBook/closeAccount';
import { composeStatementMail } from '@/engine/corpTaxBook/statementMail';
import type { Statement } from '@/engine/corpTaxBook/statements';
import { cx } from '@/lib/cx';
import { MailLimitNotice } from '@/features/corpTaxBook/MailLimitNotice';
import { MailQueueSummary } from '@/features/corpTaxBook/MailQueuePanel';
import { listQueue } from '@/features/corpTaxBook/mailQueueStore';
import {
  StatementMailPreviewDialog,
  type MailPreviewContent,
} from '@/features/corpTaxBook/StatementMailPreview';
import { editBook } from '../taxBook/bookClient';
import { editErrorMessage, useBook } from './useBook';
import { isk, periodLabel, shortDate } from './moonsFormat';
import { TRADE_HUBS } from '@/market/hubs';
import { mailTarget, statementRefineryNames, useCorporationName } from './statementMailing';

type Step = 'check' | 'send' | 'done';

function StepDot({
  n,
  label,
  state,
}: {
  n: number;
  label: string;
  state: 'done' | 'now' | 'next';
}) {
  const { t } = useTranslation();
  return (
    <li className="flex items-center gap-2">
      <span
        className={cx(
          'inline-flex size-6 items-center justify-center rounded-full border text-xs font-semibold',
          state === 'done' && 'border-success text-success',
          state === 'now' && 'border-text text-text',
          state === 'next' && 'border-line text-text-faint'
        )}
      >
        {state === 'done' ? <Icon.Done size={Icon.ICON_SIZE.sm} aria-hidden="true" /> : n}
      </span>
      <span className={cx('text-sm', state === 'next' ? 'text-text-faint' : 'text-text')}>
        {label}
        {state === 'done' && <span className="sr-only"> {t('corpTaxBook.moons.run.done')}</span>}
      </span>
    </li>
  );
}

/**
 * Check → Send → Done (#4056 steps 10-12). Check shows what the period would
 * send; Send issues each Statement (which creates its verify link, so it must
 * come first) and hands the mails to the queue (#4064), which paces them and
 * shows its own chip on every page.
 */
export function StatementRun() {
  const { t } = useTranslation();
  const ctx = useBook();
  const { view, names, canEdit, corporationId, characterId, reload } = ctx;
  const corporationName = useCorporationName();
  const [step, setStep] = useState<Step>('check');
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    queued: number;
    skipped: number;
    missingLink: number;
  } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (step !== 'done') return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [step]);
  const queue = useLiveQuery(() => listQueue(corporationId), [corporationId], []);

  const period = useMemo(() => nextRunPeriod(view), [view]);
  const plan = useMemo(() => (period ? planStatementRun(view, period) : null), [view, period]);

  // Statements issued earlier whose mail never went out (a closed tab, a refused enqueue).
  const unmailed = useMemo(
    () =>
      view.input.statements.filter((s) => {
        const settled = view.internals.byMiner
          .get(s.minerId)
          ?.allocation.byStatement.get(s.id)?.settled;
        const miner = view.input.miners.find((m) => m.id === s.minerId);
        return (
          !settled &&
          (s.mailsSent ?? 0) === 0 &&
          mailableAfterClose(miner, s) &&
          !queue.some((q) => q.statementId === s.id)
        );
      }),
    [view, queue]
  );

  const nothingToDo = !plan && unmailed.length === 0;
  const total = (plan?.lines.length ?? 0) + unmailed.length;
  const minerRow = (id: string) => view.miners.find((m) => m.id === id)!;

  /** Everything the run will send: newly drafted Statements, then earlier unmailed ones. */
  const previews = useMemo(() => {
    const out: {
      key: string;
      minerId: string;
      statement: Statement;
      amountDue: number;
      carried: number;
    }[] = [];
    for (const line of plan?.lines ?? []) {
      out.push({
        key: `line:${line.minerId}`,
        minerId: line.minerId,
        statement: statementForLine(view, plan!, line),
        amountDue: line.balanceDue,
        carried: line.carried,
      });
    }
    for (const s of unmailed) {
      // A Miner since unlinked or regrouped has no row to address the mail to; skip it rather than crash.
      const row = view.miners.find((m) => m.id === s.minerId);
      if (!row) continue;
      const owed = row.owed;
      out.push({
        key: `statement:${s.id}`,
        minerId: s.minerId,
        statement: s as Statement,
        amountDue: owed,
        carried: Math.max(0, owed - s.amount),
      });
    }
    return out;
  }, [view, plan, unmailed]);

  const previewFor = (item: (typeof previews)[number], corpName: string): MailPreviewContent => {
    const target = mailTarget(ctx, item.statement, minerRow(item.minerId), {
      amountDue: item.amountDue,
      carried: item.carried,
    });
    const mail = composeStatementMail({
      ...target,
      kind: 'statement',
      corporationName: corpName,
      refineryName: (id) => names.refinery(id),
      verifyUrl: `${window.location.origin}/corp-tax-book/verify/…`,
    });
    return {
      to: target.recipientName,
      subject: mail.subject,
      body: mail.body,
      summarised: mail.detail !== 'lines',
    };
  };
  const previewItem = previews.find((p) => p.key === previewId) ?? previews[0];
  /** Previous / Next Statement in the run, wrapping round. */
  const stepPreview = (delta: number) => {
    if (previews.length === 0 || !previewItem) return;
    const next = (previews.indexOf(previewItem) + delta + previews.length) % previews.length;
    setPreviewId(previews[next].key);
  };

  const send = async () => {
    if (corporationName === null) return;
    setBusy(true);
    setError(null);
    try {
      const targets = [];
      for (const line of plan?.lines ?? []) {
        const statement = statementForLine(view, plan!, line);
        // A guest cannot look names up, so the verify page reads them off the Statement.
        const refineryNames = statementRefineryNames(statement, names);
        await editBook(characterId, corporationId, {
          action: 'issueStatement',
          statement: {
            ...statement,
            corporationName,
            minerName: names.character(minerRow(line.minerId).mainCharacterId),
            refineryNames,
          },
        });
        targets.push(
          mailTarget(ctx, statement, minerRow(line.minerId), {
            amountDue: line.balanceDue,
            carried: line.carried,
          })
        );
      }
      for (const s of unmailed) {
        const row = minerRow(s.minerId);
        targets.push(
          mailTarget(ctx, s as Statement, row, {
            amountDue: row.owed,
            carried: Math.max(0, row.owed - s.amount),
          })
        );
      }
      const { enqueueStatements } = await import('@/features/corpTaxBook/mailQueue');
      const queued = await enqueueStatements({
        corporationId,
        corporationName,
        senderCharacterId: characterId,
        statements: targets,
        refineryName: (id) => names.refinery(id),
      });
      setResult({
        queued: queued.queued,
        skipped: queued.skipped,
        missingLink: queued.missingLink.length,
      });
      setStep('done');
    } catch (e) {
      setError(editErrorMessage(e));
    } finally {
      reload();
      setBusy(false);
    }
  };

  const order: Step[] = ['check', 'send', 'done'];
  const at = order.indexOf(step);
  const stateOf = (i: number) => (at > i ? 'done' : at === i ? 'now' : 'next');
  const title = period
    ? t('corpTaxBook.moons.run.title', { period: periodLabel(period.start, period.end) })
    : t('corpTaxBook.moons.run.titleNone');

  return (
    <Panel
      title={title}
      meta={
        view.billableThrough && (
          <span className="text-xs text-text-dim">
            {t('corpTaxBook.moons.run.billableThrough', { date: shortDate(view.billableThrough) })}
          </span>
        )
      }
    >
      {nothingToDo ? (
        <p className="text-sm text-text-dim">{t('corpTaxBook.moons.run.nothing')}</p>
      ) : (
        <>
          <ol className="mb-4 flex flex-wrap gap-x-6 gap-y-2">
            <StepDot n={1} label={t('corpTaxBook.moons.run.check')} state={stateOf(0)} />
            <StepDot n={2} label={t('corpTaxBook.moons.run.send')} state={stateOf(1)} />
            <StepDot
              n={3}
              label={t('corpTaxBook.moons.run.doneStep')}
              state={step === 'done' ? 'now' : 'next'}
            />
          </ol>
          {step === 'check' && (
            <div className="space-y-3 text-sm">
              <StatChips>
                <StatChip
                  label={t('corpTaxBook.moons.run.statements')}
                  value={t('corpTaxBook.moons.run.toSend', { count: total })}
                  emphasis
                />
                {plan && (
                  <StatChip
                    label={t('corpTaxBook.moons.run.balances')}
                    value={isk(plan.totalDue)}
                    tooltip={t('corpTaxBook.moons.run.balancesTip')}
                    tooltipGlyph="info"
                  />
                )}
                {plan && (
                  <StatChip
                    label={t('corpTaxBook.moons.run.belowMinimum', {
                      amount: isk(view.input.minimumStatement),
                    })}
                    value={t('corpTaxBook.moons.run.rollIn', { count: plan.belowMinimum })}
                  />
                )}
                {plan && (
                  <StatChip
                    label={t('corpTaxBook.moons.run.creditApplied')}
                    value={isk(plan.creditApplied)}
                  />
                )}
              </StatChips>
              <ul className="space-y-1">
                <li className="flex items-center gap-2">
                  <Icon.SeverityClear
                    size={Icon.ICON_SIZE.sm}
                    className="text-success"
                    aria-hidden
                  />
                  {t('corpTaxBook.moons.run.billable', {
                    hub:
                      TRADE_HUBS.find((h) => h.id === view.input.hubId)?.systemName ??
                      view.input.hubId,
                    form: t(`corpTaxBook.moons.settings.form.${view.input.oreForm}`),
                  })}
                </li>
                {unmailed.length > 0 && (
                  <li className="flex items-center gap-2">
                    <Icon.Warn size={Icon.ICON_SIZE.sm} className="text-warning" aria-hidden />
                    {t('corpTaxBook.moons.run.unmailed', { count: unmailed.length })}
                  </li>
                )}
                {view.needsYou.some((n) => n.kind === 'unmatched') && (
                  <li className="flex items-center gap-2">
                    <Icon.Warn size={Icon.ICON_SIZE.sm} className="text-warning" aria-hidden />
                    {t('corpTaxBook.moons.run.unmatched')}
                  </li>
                )}
              </ul>
              {previews.length > 1 && (
                <Select value={previewItem?.key ?? ''} onValueChange={setPreviewId}>
                  <SelectTrigger
                    aria-label={t('corpTaxBook.moons.run.previewFor')}
                    className="w-full max-w-xs"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {previews.map((p) => (
                      <SelectItem key={p.key} value={p.key}>
                        {names.character(minerRow(p.minerId).mainCharacterId)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {corporationName === null && (
                <p role="status" className="text-text-dim">
                  {t('corpTaxBook.moons.run.loadingCorporation')}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" onClick={() => setStep('send')} disabled={!canEdit}>
                  {t('corpTaxBook.moons.run.continue')}
                </Button>
                {previewItem && (
                  <Button
                    variant="ghost"
                    onClick={() => setPreviewOpen(true)}
                    disabled={corporationName === null}
                  >
                    {t('corpTaxBook.moons.run.preview')}
                  </Button>
                )}
              </div>
            </div>
          )}
          {step === 'send' && (
            <div className="space-y-3 text-sm">
              <p>
                {t('corpTaxBook.moons.run.sendIntro', {
                  count: total,
                  name: names.character(characterId),
                })}
              </p>
              <MailLimitNotice count={total} senderName={names.character(characterId)} />
              {corporationName === null && (
                <p role="status" className="text-text-dim">
                  {t('corpTaxBook.moons.run.loadingCorporation')}
                </p>
              )}
              {error && (
                <p role="alert" className="text-danger">
                  {error}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {previewItem && (
                  <Button
                    variant="ghost"
                    onClick={() => setPreviewOpen(true)}
                    disabled={busy || corporationName === null}
                  >
                    {t('corpTaxBook.moons.run.preview')}
                  </Button>
                )}
                <Button
                  variant="primary"
                  onClick={() => void send()}
                  disabled={busy || corporationName === null}
                >
                  {t('corpTaxBook.moons.run.sendButton', { count: total })}
                </Button>
                <Button variant="ghost" onClick={() => setStep('check')} disabled={busy}>
                  {t('corpTaxBook.moons.run.back')}
                </Button>
              </div>
            </div>
          )}
          {step === 'done' && (
            <div className="space-y-3 text-sm">
              {result && (
                <p>
                  {t('corpTaxBook.moons.run.queued', { count: result.queued })}
                  {result.skipped > 0 &&
                    ` ${t('corpTaxBook.moons.run.skipped', { count: result.skipped })}`}
                  {result.missingLink > 0 &&
                    ` ${t('corpTaxBook.moons.run.missingLink', { count: result.missingLink })}`}
                </p>
              )}
              <MailQueueSummary items={queue} now={now} />
              <p className="text-xs text-text-dim">{t('corpTaxBook.moons.run.chipNote')}</p>
              <Button variant="ghost" onClick={() => setStep('check')}>
                {t('corpTaxBook.moons.run.again')}
              </Button>
            </div>
          )}
        </>
      )}
      <StatementMailPreviewDialog
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        mail={
          previewOpen && previewItem && corporationName
            ? previewFor(previewItem, corporationName)
            : null
        }
        {...(previews.length > 1 && previewItem
          ? {
              nav: {
                position: previews.indexOf(previewItem) + 1,
                count: previews.length,
                onPrevious: () => stepPreview(-1),
                onNext: () => stepPreview(1),
              },
            }
          : {})}
      />
    </Panel>
  );
}
