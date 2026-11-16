import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Panel, plainTextActionClassName } from '@/components/ui';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import type { MinerRow, NeedsYouItem } from '@/engine/corpTaxBook/bookView';
import type { UncountedDonation } from '@/engine/corpTaxBook/uncounted';
import { disputedTax, type OreDispute } from '@/engine/corpTaxBook/disputes';
import { cx } from '@/lib/cx';
import { formatCount } from '@/lib/formatCount';
import { useBook } from './useBook';
import { useCorpAccess } from '../useCorpAccess';
import { divisionNamesFor } from '../taxBook/pushDivisionNames';
import { useTabsProjection } from './useTabsProjection';
import { useNeedsYou } from './useNeedsYou';
import {
  AssignDonationDialog,
  MarkNotTaxDialog,
  RecordPaymentDialog,
  ReasonDialog,
} from './BookDialogs';
import { isk, periodLabel, periodsLabel, shortDate } from './moonsFormat';
import { MOONS_TABS, minerPath } from './moonsPaths';
import { tabPath } from '@/lib/pageTabs';
import { mailTarget, useCorporationName } from './statementMailing';

/** The card's second action: a text link off the primary Button, so the pair is not two boxes (DESIGN.md §6, text action off a primary). */
const secondaryActionClassName = plainTextActionClassName('min-h-9 md:min-h-6');

function QueueCard({
  tone,
  title,
  body,
  actions,
}: {
  tone: 'danger' | 'warning' | 'neutral';
  title: ReactNode;
  body: string;
  actions: ReactNode;
}) {
  return (
    <li className="flex flex-wrap items-start gap-x-3 gap-y-2 px-3 py-2.5">
      <span
        aria-hidden="true"
        className={cx(
          'mt-1 h-8 w-0.5 shrink-0',
          tone === 'danger' ? 'bg-danger' : tone === 'warning' ? 'bg-warning' : 'bg-line'
        )}
      />
      <span className="min-w-0 flex-1 basis-60">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs text-text-dim">{body}</span>
      </span>
      <span className="flex shrink-0 flex-wrap items-center gap-2 max-sm:pl-3">{actions}</span>
    </li>
  );
}

/** A card's headline, a link to the Miner's page whenever the item has a Miner. */
function MinerTitle({ minerId, children }: { minerId: string | undefined; children: string }) {
  if (minerId === undefined) return <>{children}</>;
  return (
    <Link to={minerPath(minerId)} className={entityLinkClassName('inline-block py-0.5')}>
      {children}
    </Link>
  );
}

type Open =
  | { kind: 'confirm'; item: Extract<NeedsYouItem, { kind: 'declaration' }>; miner: MinerRow }
  | { kind: 'reject'; item: Extract<NeedsYouItem, { kind: 'declaration' }>; miner: MinerRow }
  | { kind: 'dismiss'; miner: MinerRow }
  | { kind: 'assign'; item: Extract<NeedsYouItem, { kind: 'unmatched' }> }
  | { kind: 'notTax'; item: Extract<NeedsYouItem, { kind: 'unmatched' }> }
  | { kind: 'writeOff'; item: Extract<NeedsYouItem, { kind: 'leaver' }>; miner: MinerRow }
  | { kind: 'disputeDismiss'; dispute: OreDispute }
  | { kind: 'disputeReject'; dispute: OreDispute }
  | null;

/** "Needs you": the few things only an officer can answer, a panel of the Overview. */
export function NeedsYouQueue() {
  const { t } = useTranslation();
  const ctx = useBook();
  const { view, names, edit, canEdit, characterId, corporationId, settings } = ctx;
  const { miners } = useTabsProjection();
  const { needsYou, uncounted, disputes, runDue, count } = useNeedsYou();
  const [open, setOpen] = useState<Open>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const close = () => setOpen(null);
  // The tax on only the disputed ore: what waiving a dispute credits (undefined: cannot price it).
  const waiveIsk =
    open?.kind === 'disputeDismiss' ? disputedTax(open.dispute, view.charges) : undefined;
  const [busy, setBusy] = useState(false);
  // The corp's own name when a Director's visit stored one, else the numbered division.
  const divisionLabel = (division: number) =>
    settings.divisionNames?.[division] ?? t('corpTaxBook.moons.settings.division', { n: division });
  const canReadDivisions = useCorpAccess().capabilities.canReadDivisions;
  const countPatch = async (division: number) => {
    const divisions = [...settings.divisions, division].sort((a, b) => a - b);
    // Its name goes with it, so members see the corp's name for the division at once (#6161).
    const divisionNames = await divisionNamesFor(
      characterId,
      corporationId,
      canReadDivisions,
      divisions,
      settings.divisionNames
    );
    return { divisions, ...(divisionNames ? { divisionNames } : {}) };
  };
  const answerUncounted = async (u: UncountedDonation, how: 'count' | 'notTax') => {
    setBusy(true);
    try {
      await edit(
        how === 'count'
          ? { action: 'updateSettings', patch: await countPatch(u.division) }
          : { action: 'ignoreUncounted', uncountedId: u.id }
      );
      setNotice(
        how === 'count'
          ? t('corpTaxBook.moons.needs.uncounted.counted', { division: divisionLabel(u.division) })
          : t('corpTaxBook.moons.needs.uncounted.ignored')
      );
    } catch {
      setNotice(t('corpTaxBook.moons.needs.uncounted.failed'));
    } finally {
      setBusy(false);
    }
  };
  const corporationName = useCorporationName();
  const minerOf = (id: string) => miners.find((m) => m.id === id)!;
  const nameOf = (id: string) => names.character(minerOf(id).mainCharacterId);

  const statementPeriod = (id: string) => {
    const s = view.input.statements.find((x) => x.id === id);
    return s ? periodLabel(s.periodStart, s.periodEnd) : id;
  };

  // An overdue Miner and a leaver get the same manual reminder (one per Statement).
  const remind = async (item: { minerId: string; statementId?: string }) => {
    const miner = minerOf(item.minerId);
    const statement = view.input.statements.find((s) => s.id === item.statementId);
    if (!statement || corporationName === null) return;
    const { enqueueReminder } = await import('@/features/corpTaxBook/mailQueue');
    const result = await enqueueReminder({
      corporationId,
      corporationName,
      senderCharacterId: characterId,
      refineryName: (id) => names.refinery(id),
      statement: mailTarget(ctx, statement, miner, { amountDue: miner.owed, carried: 0 }),
      remindersStopped: statement.remindersStopped === true,
      manualRemindersSent: statement.manualRemindersSent ?? 0,
    });
    setNotice(
      result.ok
        ? t('corpTaxBook.moons.needs.reminderQueued', { name: nameOf(item.minerId) })
        : t(`corpTaxBook.moons.needs.reminderRefused.${result.reason}`)
    );
    ctx.reload();
  };

  return (
    <Panel title={t('corpTaxBook.moons.needs.title', { count })} padded={false}>
      {notice && (
        <p role="status" className="px-3 py-2 text-xs text-text-dim">
          {notice}
        </p>
      )}
      {count === 0 && (
        <p className="px-3 py-2.5 text-xs text-text-dim">{t('corpTaxBook.moons.needs.none')}</p>
      )}
      <ul className="divide-y divide-line">
        {runDue.length > 0 && (
          // #6208: closed periods nobody has billed. Overdue counts from issue, so a forgotten
          // run would otherwise bill no one; the run sends every listed period, oldest first.
          <QueueCard
            tone="warning"
            title={
              <Link
                to={tabPath(MOONS_TABS, 'statements')}
                className={entityLinkClassName('inline-block py-0.5')}
              >
                {t('corpTaxBook.moons.needs.runDue.title', { periods: periodsLabel(runDue) })}
              </Link>
            }
            body={t('corpTaxBook.moons.needs.runDue.body', { count: runDue.length })}
            actions={null}
          />
        )}
        {needsYou.map((item) => {
          switch (item.kind) {
            case 'declaration': {
              const miner = minerOf(item.minerId);
              return (
                <QueueCard
                  key={`d-${item.declaration.id}`}
                  tone="warning"
                  title={
                    <MinerTitle minerId={item.minerId}>
                      {t('corpTaxBook.moons.needs.declaration.title', {
                        name: nameOf(item.minerId),
                        amount: isk(item.owed),
                      })}
                    </MinerTitle>
                  }
                  body={[
                    t('corpTaxBook.moons.needs.declaration.body', {
                      kind: t(`corpTaxBook.moons.needs.declaration.kind.${item.declaration.kind}`),
                      date: shortDate(item.declaration.at),
                    }),
                    item.declaration.amount !== undefined &&
                      t('corpTaxBook.moons.needs.declaration.declared', {
                        amount: isk(item.declaration.amount),
                      }),
                    item.declaration.note &&
                      t('corpTaxBook.moons.needs.declaration.note', {
                        note: item.declaration.note,
                      }),
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  actions={
                    canEdit ? (
                      <>
                        <Button size="sm" onClick={() => setOpen({ kind: 'confirm', item, miner })}>
                          {t('corpTaxBook.moons.needs.declaration.confirm')}
                        </Button>
                        <button
                          type="button"
                          className={secondaryActionClassName}
                          onClick={() => setOpen({ kind: 'reject', item, miner })}
                        >
                          {t('corpTaxBook.moons.needs.declaration.reject')}
                        </button>
                      </>
                    ) : null
                  }
                />
              );
            }
            case 'overdue': {
              const miner = minerOf(item.minerId);
              return (
                <QueueCard
                  key={`o-${item.minerId}`}
                  tone="danger"
                  title={
                    <MinerTitle minerId={item.minerId}>
                      {t('corpTaxBook.moons.needs.overdue.title', {
                        name: nameOf(item.minerId),
                        count: item.days,
                        amount: isk(item.owed),
                      })}
                    </MinerTitle>
                  }
                  body={t('corpTaxBook.moons.needs.overdue.body', {
                    period: statementPeriod(item.statementId),
                  })}
                  actions={
                    canEdit ? (
                      <>
                        <Button
                          size="sm"
                          onClick={() => void remind(item)}
                          disabled={corporationName === null}
                        >
                          {t('corpTaxBook.moons.needs.overdue.remind')}
                        </Button>
                        <button
                          type="button"
                          className={secondaryActionClassName}
                          onClick={() => setOpen({ kind: 'dismiss', miner })}
                        >
                          {t('corpTaxBook.moons.needs.overdue.dismiss')}
                        </button>
                      </>
                    ) : null
                  }
                />
              );
            }
            case 'unmatched':
              return (
                <QueueCard
                  key={`u-${item.payment.id}`}
                  tone="neutral"
                  title={
                    <MinerTitle
                      // From the book as it is now: a sender who has since joined a Miner has a page.
                      minerId={
                        miners.find((m) => m.characterIds.includes(item.payment.characterId))?.id
                      }
                    >
                      {t('corpTaxBook.moons.needs.unmatched.title', {
                        amount: isk(item.payment.amount),
                        name: names.character(item.payment.characterId),
                      })}
                    </MinerTitle>
                  }
                  body={t(
                    // Held because the sender's Miner owed nothing (#6207); otherwise, from the book
                    // as it is now: a sender who has since joined a Miner is not a stranger.
                    item.payment.reviewReason === 'no-open-balance'
                      ? 'corpTaxBook.moons.needs.unmatched.bodyReview'
                      : miners.some((m) => m.characterIds.includes(item.payment.characterId))
                        ? 'corpTaxBook.moons.needs.unmatched.bodyInMiner'
                        : 'corpTaxBook.moons.needs.unmatched.body',
                    {
                      date: shortDate(item.payment.at),
                      name: names.character(item.payment.characterId),
                    }
                  )}
                  actions={
                    canEdit ? (
                      <>
                        <Button size="sm" onClick={() => setOpen({ kind: 'assign', item })}>
                          {t('corpTaxBook.moons.needs.unmatched.assign')}
                        </Button>
                        <button
                          type="button"
                          className={secondaryActionClassName}
                          onClick={() => setOpen({ kind: 'notTax', item })}
                        >
                          {t('corpTaxBook.moons.needs.unmatched.notTax')}
                        </button>
                      </>
                    ) : null
                  }
                />
              );
            case 'leaver': {
              const miner = minerOf(item.minerId);
              return (
                <QueueCard
                  key={`l-${item.minerId}`}
                  tone="neutral"
                  title={
                    <MinerTitle minerId={item.minerId}>
                      {t('corpTaxBook.moons.needs.leaver.title', {
                        name: nameOf(item.minerId),
                        amount: isk(item.owed),
                      })}
                    </MinerTitle>
                  }
                  body={t('corpTaxBook.moons.needs.leaver.body')}
                  actions={
                    canEdit && item.statementId ? (
                      <>
                        <Button
                          size="sm"
                          onClick={() => void remind(item)}
                          disabled={corporationName === null}
                        >
                          {t('corpTaxBook.moons.needs.leaver.remind')}
                        </Button>
                        <button
                          type="button"
                          className={secondaryActionClassName}
                          onClick={() => setOpen({ kind: 'writeOff', item, miner })}
                        >
                          {t('corpTaxBook.moons.needs.leaver.writeOff')}
                        </button>
                      </>
                    ) : null
                  }
                />
              );
            }
          }
        })}
        {disputes.map((d) => (
          <QueueCard
            key={`p-${d.id}`}
            tone="warning"
            title={
              <MinerTitle minerId={miners.some((m) => m.id === d.minerId) ? d.minerId : undefined}>
                {t('corpTaxBook.moons.needs.dispute.title', {
                  name: names.character(d.by),
                  date: shortDate(d.date),
                  payee: [...new Set(d.lines.map((l) => l.payeeName))].join(', '),
                })}
              </MinerTitle>
            }
            body={[
              t('corpTaxBook.moons.needs.dispute.body', {
                ore: d.lines
                  .map((l) =>
                    t('corpTaxBook.moons.needs.dispute.line', {
                      quantity: formatCount(l.quantity),
                      ore: names.ore(l.typeId),
                      payee: l.payeeName,
                    })
                  )
                  .join('; '),
              }),
              d.note && t('corpTaxBook.moons.needs.declaration.note', { note: d.note }),
            ]
              .filter(Boolean)
              .join(' ')}
            actions={
              canEdit ? (
                <>
                  <Button size="sm" onClick={() => setOpen({ kind: 'disputeDismiss', dispute: d })}>
                    {t('corpTaxBook.moons.needs.dispute.dismiss')}
                  </Button>
                  <button
                    type="button"
                    className={secondaryActionClassName}
                    onClick={() => setOpen({ kind: 'disputeReject', dispute: d })}
                  >
                    {t('corpTaxBook.moons.needs.dispute.reject')}
                  </button>
                </>
              ) : null
            }
          />
        ))}
        {uncounted.map((u) => (
          <QueueCard
            key={`x-${u.id}`}
            tone="warning"
            title={
              <MinerTitle minerId={miners.find((m) => m.characterIds.includes(u.characterId))?.id}>
                {t('corpTaxBook.moons.needs.uncounted.title', {
                  amount: isk(u.amount),
                  name: names.character(u.characterId),
                  division: divisionLabel(u.division),
                })}
              </MinerTitle>
            }
            body={t('corpTaxBook.moons.needs.uncounted.body', { date: shortDate(u.at) })}
            actions={
              canEdit ? (
                <>
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => void answerUncounted(u, 'count')}
                  >
                    {t('corpTaxBook.moons.needs.uncounted.count', {
                      division: divisionLabel(u.division),
                    })}
                  </Button>
                  <button
                    type="button"
                    className={secondaryActionClassName}
                    disabled={busy}
                    onClick={() => void answerUncounted(u, 'notTax')}
                  >
                    {t('corpTaxBook.moons.needs.uncounted.notTax')}
                  </button>
                </>
              ) : null
            }
          />
        ))}
      </ul>
      {open?.kind === 'confirm' && (
        <RecordPaymentDialog
          open
          onClose={close}
          miner={open.miner}
          minerName={names.character(open.miner.mainCharacterId)}
          // The amount the Miner declared, when they gave one (#6206).
          defaultAmount={open.item.declaration.amount ?? open.item.owed}
          // One payment per declaration: a retry finds it recorded, and the declaration is
          // resolved in the same write, so a second officer (by hand or by matching a donation)
          // is refused instead of counting the ISK twice.
          paymentId={`m_${open.item.declaration.id}`}
          declarationId={open.item.declaration.id}
        />
      )}
      {open?.kind === 'reject' && (
        <ReasonDialog
          open
          onClose={close}
          title={t('corpTaxBook.moons.dialogs.reject.title', {
            name: names.character(open.miner.mainCharacterId),
          })}
          intro={t('corpTaxBook.moons.dialogs.reject.intro', { amount: isk(open.item.owed) })}
          reasonLabel={t('corpTaxBook.moons.dialogs.reject.reason')}
          confirmLabel={t('corpTaxBook.moons.dialogs.reject.confirm')}
          effect={t('corpTaxBook.moons.dialogs.reject.effect')}
          run={async (reason) => {
            await edit({
              action: 'resolveDeclaration',
              declarationId: open.item.declaration.id,
              resolution: 'rejected',
              reason,
            });
          }}
        />
      )}
      {open?.kind === 'disputeDismiss' && (
        <ReasonDialog
          open
          onClose={close}
          title={t('corpTaxBook.moons.dialogs.dispute.dismissTitle', {
            name: names.character(open.dispute.by),
            date: shortDate(open.dispute.date),
          })}
          intro={
            waiveIsk === undefined
              ? t('corpTaxBook.moons.dialogs.dispute.dismissUnpriced')
              : t('corpTaxBook.moons.dialogs.dispute.dismissIntro', { amount: isk(waiveIsk) })
          }
          reasonLabel={t('corpTaxBook.moons.dialogs.reasonShown')}
          confirmLabel={
            waiveIsk === undefined
              ? t('corpTaxBook.moons.needs.dispute.dismiss')
              : t('corpTaxBook.moons.dialogs.dispute.dismissConfirm', { amount: isk(waiveIsk) })
          }
          canConfirm={waiveIsk !== undefined && waiveIsk > 0}
          run={async (reason) => {
            // Only the disputed ore's tax, as one credit. The server prices it from the day's
            // Statement; this figure counts only for a day not billed yet (a Director's call).
            await edit({
              action: 'dismissDispute',
              disputeId: open.dispute.id,
              minerId: open.dispute.minerId,
              amountIsk: waiveIsk,
              reason,
            });
          }}
        />
      )}
      {open?.kind === 'disputeReject' && (
        <ReasonDialog
          open
          onClose={close}
          title={t('corpTaxBook.moons.dialogs.dispute.rejectTitle', {
            name: names.character(open.dispute.by),
            date: shortDate(open.dispute.date),
          })}
          intro={t('corpTaxBook.moons.dialogs.dispute.rejectIntro')}
          reasonLabel={t('corpTaxBook.moons.dialogs.reject.reason')}
          confirmLabel={t('corpTaxBook.moons.needs.dispute.reject')}
          run={async (reason) => {
            await edit({ action: 'rejectDispute', disputeId: open.dispute.id, reason });
          }}
        />
      )}
      {open?.kind === 'dismiss' && (
        <ReasonDialog
          open
          onClose={close}
          title={t('corpTaxBook.moons.dialogs.dismissMiner.title', {
            name: names.character(open.miner.mainCharacterId),
          })}
          intro={t('corpTaxBook.moons.dialogs.dismissMiner.intro')}
          reasonLabel={t('corpTaxBook.moons.dialogs.reasonShown')}
          confirmLabel={t('corpTaxBook.moons.dialogs.dismissConfirm', {
            amount: isk(open.miner.owed),
          })}
          run={async (reason) => {
            await edit({
              action: 'dismiss',
              scope: 'miner',
              targetId: open.miner.id,
              reason,
              amountIsk: open.miner.owed,
            });
          }}
        />
      )}
      {open?.kind === 'assign' && (
        <AssignDonationDialog
          open
          onClose={close}
          payment={open.item.payment}
          fromName={names.character(open.item.payment.characterId)}
        />
      )}
      {open?.kind === 'notTax' && (
        <MarkNotTaxDialog
          open
          onClose={close}
          payment={open.item.payment}
          fromName={names.character(open.item.payment.characterId)}
        />
      )}
      {open?.kind === 'writeOff' && (
        <ReasonDialog
          open
          onClose={close}
          title={t('corpTaxBook.moons.dialogs.writeOff.title', {
            name: names.character(open.miner.mainCharacterId),
          })}
          intro={t('corpTaxBook.moons.dialogs.writeOff.intro', { amount: isk(open.item.owed) })}
          reasonLabel={t('corpTaxBook.moons.dialogs.writeOff.reason')}
          confirmLabel={t('corpTaxBook.moons.dialogs.writeOff.confirm', {
            amount: isk(open.item.owed),
          })}
          run={async (reason) => {
            // The whole balance, so no Statement: it reduces open Statements oldest first (#4637).
            await edit({
              action: 'writeOff',
              minerId: open.miner.id,
              amount: open.item.owed,
              reason,
            });
          }}
        />
      )}
    </Panel>
  );
}
