import { useEffect, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Button,
  Checkbox,
  Eyebrow,
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
import { mailableAfterClose } from '@/engine/corpTaxBook/closeAccount';
import { composeStatementMail, previewVerifyUrl } from '@/engine/corpTaxBook/statementMail';
import type { Statement } from '@/engine/corpTaxBook/statements';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import { DAY_MS } from '@/lib/age';
import { cx } from '@/lib/cx';
import { MailLimitNotice } from '@/features/corpTaxBook/MailLimitNotice';
import { MailQueueSummary } from '@/features/corpTaxBook/MailQueuePanel';
import { listQueue } from '@/features/corpTaxBook/mailQueueStore';
import {
  EditableMailPreview,
  StatementMailPreviewDialog,
  type MailEdit,
  type MailPreviewContent,
} from '@/features/corpTaxBook/StatementMailPreview';
import { useIsBelowDesktop } from '@/lib/useIsBelowDesktop';
import { editBook } from '../taxBook/bookClient';
import { editErrorMessage, useBook } from './useBook';
import { isk } from './moonsFormat';
import { TRADE_HUBS } from '@/market/hubs';
import { mailTarget, statementRefineryNames, useCorporationName } from './statementMailing';
import { plannedNotices } from './useNeedsYou';

type Step = 'check' | 'send' | 'done';

/** A Miner mailed a Statement within this long is left unticked in the run. */
const RECENTLY_MAILED_MS = 7 * DAY_MS;

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
          state === 'next' && 'border-line text-text-dim'
        )}
      >
        {state === 'done' ? <Icon.Done size={Icon.ICON_SIZE.sm} aria-hidden="true" /> : n}
      </span>
      <span className={cx('text-sm', state === 'next' ? 'text-text-dim' : 'text-text')}>
        {label}
        {state === 'done' && <span className="sr-only"> {t('corpTaxBook.moons.run.done')}</span>}
      </span>
    </li>
  );
}

/**
 * Check → Send → Done (#4056 steps 10-12). Check shows the late notices the run would send
 * (#6294), plus any earlier Statement whose mail never went out; Send issues each notice (which
 * creates its verify link, so it must come first) and hands the mails to the queue (#4064), which
 * paces them and shows its own chip on every page. On a desktop the chosen Miner's mail shows
 * beside Check and Send; below it, "Preview mail" opens it in a dialog.
 */
export function StatementRun() {
  const { t } = useTranslation();
  const ctx = useBook();
  const { view, names, canEdit, corporationId, characterId, reload, settings } = ctx;
  const corporationName = useCorporationName();
  const [step, setStep] = useState<Step>('check');
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const inline = !useIsBelowDesktop();
  // A dialog left open on a phone must not pop back after a trip through the desktop layout.
  const [wasInline, setWasInline] = useState(inline);
  if (wasInline !== inline) {
    setWasInline(inline);
    if (inline) setPreviewOpen(false);
  }
  const previewLabelId = useId();
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
  /** The officer's own ticks; a Miner they have not touched follows the default (`recentlyMailed`). */
  const [ticks, setTicks] = useState<ReadonlyMap<string, boolean>>(new Map());
  /**
   * The officer's own wording for a mail, by preview key: what the queue sends instead. `basis`
   * is the standard body it was edited from, so a later change to the figures is flagged.
   */
  const [edits, setEdits] = useState<ReadonlyMap<string, MailEdit>>(new Map());

  const notices = useMemo(
    () => plannedNotices(view, settings.noticeRules),
    [view, settings.noticeRules]
  );
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

  const nothingToDo = notices.length === 0 && unmailed.length === 0;
  const minerRow = (id: string) => view.miners.find((m) => m.id === id)!;

  /** Everything the run will send: the new late notices, then earlier unmailed Statements. */
  const previews = useMemo(() => {
    const out: {
      key: string;
      minerId: string;
      statement: Statement;
      amountDue: number;
      carried: number;
    }[] = [];
    for (const n of notices) {
      out.push({
        key: `notice:${n.minerId}`,
        minerId: n.minerId,
        statement: n.statement,
        amountDue: n.owed,
        carried: n.carried,
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
  }, [view, notices, unmailed]);

  /** The last time any Statement of this Miner was mailed, if ever. */
  const lastMailedAt = (minerId: string): number | null => {
    let last: number | null = null;
    for (const s of view.input.statements) {
      if (s.minerId !== minerId || !s.lastMailedAt) continue;
      const at = Date.parse(s.lastMailedAt);
      if (!Number.isNaN(at) && (last === null || at > last)) last = at;
    }
    return last;
  };
  /** Mailed within the last 7 days: unticked unless the officer ticks them. */
  const recentlyMailed = (minerId: string): boolean => {
    const at = lastMailedAt(minerId);
    return at !== null && now - at < RECENTLY_MAILED_MS;
  };
  const isChosen = (p: { key: string; minerId: string }): boolean =>
    ticks.get(p.key) ?? !recentlyMailed(p.minerId);
  const chosen = new Set(previews.filter(isChosen).map((p) => p.key));
  const total = chosen.size;

  /** The mail the run would send unedited, its verify link the preview one (`previewVerifyUrl`). */
  const standardMail = (item: (typeof previews)[number], corpName: string): MailPreviewContent => {
    const target = mailTarget(ctx, item.statement, minerRow(item.minerId), {
      amountDue: item.amountDue,
      carried: item.carried,
    });
    const mail = composeStatementMail({
      ...target,
      kind: 'statement',
      corporationName: corpName,
      refineryName: (id) => names.refinery(id),
      verifyUrl: previewVerifyUrl(window.location.origin),
    });
    return {
      to: target.recipientName,
      subject: mail.subject,
      body: mail.body,
      summarised: mail.detail !== 'lines',
    };
  };
  /** The officer's edit was made from a standard mail that has since changed. */
  const isStale = (item: (typeof previews)[number]): boolean => {
    const edit = edits.get(item.key);
    return (
      edit !== undefined &&
      corporationName !== null &&
      standardMail(item, corporationName).body !== edit.basis
    );
  };
  const previewFor = (item: (typeof previews)[number], corpName: string): MailPreviewContent => {
    const standard = standardMail(item, corpName);
    const edit = edits.get(item.key);
    return edit
      ? { to: standard.to, subject: edit.subject, body: edit.body, summarised: false }
      : standard;
  };
  /** A mail's target for the queue, carrying the officer's edit when there is one. */
  const withEdit = (key: string, target: ReturnType<typeof mailTarget>) => {
    const edit = edits.get(key);
    return edit ? { ...target, edited: { subject: edit.subject, body: edit.body } } : target;
  };
  const previewItem = previews.find((p) => p.key === previewId) ?? previews[0];
  const showInline = inline && previewItem !== undefined && step !== 'done';
  const mail =
    previewItem && corporationName && (showInline || previewOpen)
      ? previewFor(previewItem, corporationName)
      : null;
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
    // A failure part-way keeps what was issued (and queued); the next run plans the
    // remaining notices and offers any Statement whose mail never left.
    const sent = { queued: 0, skipped: 0, missingLink: 0 };
    /** Each notice issued this run: its preview key, then the key of the Statement it became. */
    const issued: { from: string; to: string }[] = [];
    /** Statements the queue refused for want of a verify link: they come back unmailed. */
    const notQueued: string[] = [];
    /**
     * The edits still wanted after this send: an issued notice's edit follows its Statement, and
     * after a send that finished only the Statements left unmailed (`keep`) keep theirs.
     */
    const carryEdits = (keep?: readonly string[]) =>
      setEdits((current) => {
        const next = new Map(current);
        for (const { from, to } of issued) {
          const edit = next.get(from);
          if (!edit) continue;
          next.delete(from);
          next.set(to, edit);
        }
        if (!keep) return next;
        const wanted = new Set(keep.map((id) => `statement:${id}`));
        return new Map([...next].filter(([key]) => wanted.has(key)));
      });
    const queueTargets = async (targets: ReturnType<typeof mailTarget>[]) => {
      if (targets.length === 0) return;
      // Inside `try`: a chunk that will not load is an error shown, not a run stuck busy.
      const { enqueueStatements } = await import('@/features/corpTaxBook/mailQueue');
      const queued = await enqueueStatements({
        corporationId,
        corporationName,
        senderCharacterId: characterId,
        statements: targets,
        refineryName: (id) => names.refinery(id),
      });
      sent.queued += queued.queued;
      sent.skipped += queued.skipped;
      sent.missingLink += queued.missingLink.length;
      notQueued.push(...queued.missingLink);
    };
    try {
      // Earlier Statements whose mail never went out are the oldest; they go first.
      await queueTargets(
        unmailed
          .filter((s) => chosen.has(`statement:${s.id}`))
          .map((s) => {
            const row = minerRow(s.minerId);
            return withEdit(
              `statement:${s.id}`,
              mailTarget(ctx, s as Statement, row, {
                amountDue: row.owed,
                carried: Math.max(0, row.owed - s.amount),
              })
            );
          })
      );
      // Late notices (#6294): each issued (which makes its verify link), then all queued.
      const noticeTargets = [];
      for (const n of notices) {
        // A notice is rebuilt every run, so an unticked one is not issued at all.
        if (!chosen.has(`notice:${n.minerId}`)) continue;
        const row = minerRow(n.minerId);
        await editBook(characterId, corporationId, {
          action: 'issueStatement',
          statement: {
            ...n.statement,
            corporationName,
            minerName: names.character(row.mainCharacterId),
            refineryNames: statementRefineryNames(n.statement, names),
          },
        });
        issued.push({ from: `notice:${n.minerId}`, to: `statement:${n.statement.id}` });
        noticeTargets.push(
          withEdit(
            `notice:${n.minerId}`,
            mailTarget(ctx, n.statement, row, { amountDue: n.owed, carried: n.carried })
          )
        );
      }
      await queueTargets(noticeTargets);
      setResult(sent);
      carryEdits(notQueued);
      setStep('done');
    } catch (e) {
      // A notice issued before the failure comes back as an unmailed Statement: its edit follows.
      carryEdits();
      setError(editErrorMessage(e));
    } finally {
      reload();
      setBusy(false);
    }
  };

  const order: Step[] = ['check', 'send', 'done'];
  const at = order.indexOf(step);
  const stateOf = (i: number) => (at > i ? 'done' : at === i ? 'now' : 'next');
  /** The previewed mail with Edit; keyed by Miner, so an unsaved draft never moves to another. */
  const editablePreview = mail && previewItem && (
    <EditableMailPreview
      key={previewItem.key}
      mail={mail}
      edited={edits.has(previewItem.key)}
      stale={isStale(previewItem)}
      basis={edits.get(previewItem.key)?.basis ?? mail.body}
      onSave={(edit) => setEdits((current) => new Map(current).set(previewItem.key, edit))}
      onReset={() =>
        setEdits((current) => {
          const next = new Map(current);
          next.delete(previewItem.key);
          return next;
        })
      }
      disabled={busy || !canEdit}
    />
  );
  /** Whose mail the preview shows, with a visible label: the run's Miners by main Character. */
  const minerPicker = previews.length > 1 && previewItem && (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <span id={previewLabelId} className="text-text-dim">
        {t('corpTaxBook.moons.run.previewFor')}
      </span>
      <Select value={previewItem.key} onValueChange={setPreviewId}>
        <SelectTrigger aria-labelledby={previewLabelId} className="w-full max-w-xs">
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
    </div>
  );

  return (
    <Panel title={t('corpTaxBook.moons.run.noticesTitle')}>
      {nothingToDo ? (
        <p className="text-sm text-text-dim">{t('corpTaxBook.moons.run.noticesNothing')}</p>
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
          <div
            className={cx(
              showInline &&
                'grid items-start gap-x-6 gap-y-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]'
            )}
          >
            <div className="min-w-0">
              {step === 'check' && (
                <div className="space-y-3 text-sm">
                  <StatChips>
                    <StatChip
                      label={t('corpTaxBook.moons.run.notices')}
                      value={t('corpTaxBook.moons.run.toSend', { count: total })}
                      emphasis
                    />
                    {notices.length > 0 && (
                      <StatChip
                        label={t('corpTaxBook.moons.run.noticesOwed')}
                        value={isk(notices.reduce((sum, n) => sum + n.owed, 0))}
                        tooltip={t('corpTaxBook.moons.run.noticesOwedTip')}
                        tooltipGlyph="info"
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
                      {t('corpTaxBook.moons.run.noticesBillable', {
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
                  <fieldset className="space-y-1">
                    <legend className="mb-1 text-text-dim">
                      {t('corpTaxBook.moons.run.recipients')}
                    </legend>
                    {previews.map((p) => {
                      const at = lastMailedAt(p.minerId);
                      return (
                        <label
                          key={p.key}
                          className={cx('flex items-start gap-2 text-text', tappableRowClassName)}
                        >
                          <Checkbox
                            className="mt-0.5"
                            checked={chosen.has(p.key)}
                            onChange={(e) => {
                              const checked = e.currentTarget.checked;
                              setTicks((current) => new Map(current).set(p.key, checked));
                            }}
                          />
                          <span className="min-w-0">
                            {names.character(minerRow(p.minerId).mainCharacterId)}
                            <span className="text-text-dim"> · {isk(p.amountDue)}</span>
                            {edits.has(p.key) && (
                              <span
                                className={cx(
                                  'block text-xs',
                                  isStale(p) ? 'text-warning' : 'text-accent'
                                )}
                              >
                                {t(
                                  isStale(p)
                                    ? 'corpTaxBook.moons.run.editedStale'
                                    : 'corpTaxBook.moons.run.edited'
                                )}
                              </span>
                            )}
                            {at !== null && recentlyMailed(p.minerId) && (
                              <span className="block text-xs text-text-dim">
                                {t('corpTaxBook.moons.run.mailedRecently', {
                                  count: Math.max(0, Math.floor((now - at) / DAY_MS)),
                                })}
                              </span>
                            )}
                          </span>
                        </label>
                      );
                    })}
                  </fieldset>
                  {!inline && minerPicker}
                  {corporationName === null && (
                    <p role="status" className="text-text-dim">
                      {t('corpTaxBook.moons.run.loadingCorporation')}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="primary"
                      onClick={() => setStep('send')}
                      disabled={!canEdit || total === 0}
                    >
                      {t('corpTaxBook.moons.run.continue')}
                    </Button>
                    {previewItem && !inline && (
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
                    {previewItem && !inline && (
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
                      {t('corpTaxBook.moons.run.sendNotices', { count: total })}
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
                      {t('corpTaxBook.moons.run.noticesQueued', { count: result.queued })}
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
            </div>
            {showInline && (
              <section
                aria-label={t('corpTaxBook.moons.run.mailPreview')}
                className="min-w-0 space-y-3 rounded-xs border border-line p-3"
              >
                <Eyebrow as="h3">{t('corpTaxBook.moons.run.mailPreview')}</Eyebrow>
                {minerPicker}
                {editablePreview ? (
                  <div className="max-h-[36rem] overflow-y-auto">{editablePreview}</div>
                ) : (
                  <p className="text-sm text-text-dim">
                    {t('corpTaxBook.moons.run.loadingCorporation')}
                  </p>
                )}
              </section>
            )}
          </div>
        </>
      )}
      <StatementMailPreviewDialog
        open={previewOpen && !inline}
        onClose={() => setPreviewOpen(false)}
        mail={mail}
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
      >
        {editablePreview}
      </StatementMailPreviewDialog>
    </Panel>
  );
}
