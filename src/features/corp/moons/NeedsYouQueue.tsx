import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import type { MinerRow, NeedsYouItem } from '@/engine/corpTaxBook/bookView';
import { cx } from '@/lib/cx';
import { useBook } from './useBook';
import {
  AssignDonationDialog,
  MarkNotTaxDialog,
  RecordPaymentDialog,
  ReasonDialog,
} from './BookDialogs';
import { isk, shortDate } from './moonsFormat';
import { minerPath } from './moonsPaths';
import {
  manualRemindersSent,
  mailTarget,
  remindersStopped,
  useCorporationName,
} from './statementMailing';

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
    <div
      className={cx(
        'space-y-2 rounded-xs border bg-panel p-3',
        tone === 'danger'
          ? 'border-danger/50'
          : tone === 'warning'
            ? 'border-warning/50'
            : 'border-line'
      )}
    >
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-xs text-text-dim">{body}</p>
      <div className="flex flex-wrap gap-2">{actions}</div>
    </div>
  );
}

type Open =
  | { kind: 'confirm'; item: Extract<NeedsYouItem, { kind: 'declaration' }>; miner: MinerRow }
  | { kind: 'reject'; item: Extract<NeedsYouItem, { kind: 'declaration' }>; miner: MinerRow }
  | { kind: 'dismiss'; miner: MinerRow }
  | { kind: 'assign'; item: Extract<NeedsYouItem, { kind: 'unmatched' }> }
  | { kind: 'notTax'; item: Extract<NeedsYouItem, { kind: 'unmatched' }> }
  | { kind: 'writeOff'; item: Extract<NeedsYouItem, { kind: 'leaver' }>; miner: MinerRow }
  | null;

/** #4056 step 3's "Needs you": the few things only an officer can answer, above the Miners table. */
export function NeedsYouQueue() {
  const { t } = useTranslation();
  const ctx = useBook();
  const { view, names, edit, canEdit, characterId, corporationId } = ctx;
  const corporationName = useCorporationName();
  const [open, setOpen] = useState<Open>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const close = () => setOpen(null);
  if (view.needsYou.length === 0) return null;
  const minerOf = (id: string) => view.miners.find((m) => m.id === id)!;
  const nameOf = (id: string) => names.character(minerOf(id).mainCharacterId);

  const remind = async (item: Extract<NeedsYouItem, { kind: 'overdue' }>) => {
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
      remindersStopped: remindersStopped(statement),
      manualRemindersSent: manualRemindersSent(statement),
    });
    setNotice(
      result.ok
        ? t('corpTaxBook.moons.needs.reminderQueued', { name: nameOf(item.minerId) })
        : t(`corpTaxBook.moons.needs.reminderRefused.${result.reason}`)
    );
    ctx.reload();
  };

  return (
    <div className="space-y-2">
      <p className={eyebrowClassName}>
        {t('corpTaxBook.moons.needs.title', { count: view.needsYou.length })}
      </p>
      {notice && (
        <p role="status" className="text-xs text-text-dim">
          {notice}
        </p>
      )}
      <div className="grid gap-2 md:grid-cols-2">
        {view.needsYou.map((item) => {
          switch (item.kind) {
            case 'declaration': {
              const miner = minerOf(item.minerId);
              return (
                <QueueCard
                  key={`d-${item.declaration.id}`}
                  tone="warning"
                  title={t('corpTaxBook.moons.needs.declaration.title', {
                    name: nameOf(item.minerId),
                    amount: isk(item.owed),
                  })}
                  body={t('corpTaxBook.moons.needs.declaration.body', {
                    kind: t(`corpTaxBook.moons.needs.declaration.kind.${item.declaration.kind}`),
                    date: shortDate(item.declaration.at),
                  })}
                  actions={
                    canEdit ? (
                      <>
                        <Button size="sm" onClick={() => setOpen({ kind: 'confirm', item, miner })}>
                          {t('corpTaxBook.moons.needs.declaration.confirm')}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setOpen({ kind: 'reject', item, miner })}
                        >
                          {t('corpTaxBook.moons.needs.declaration.reject')}
                        </Button>
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
                    <Link to={minerPath(item.minerId)} className="hover:underline">
                      {t('corpTaxBook.moons.needs.overdue.title', {
                        name: nameOf(item.minerId),
                        days: item.days,
                        amount: isk(item.owed),
                      })}
                    </Link>
                  }
                  body={t('corpTaxBook.moons.needs.overdue.body', { id: item.statementId })}
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
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setOpen({ kind: 'dismiss', miner })}
                        >
                          {t('corpTaxBook.moons.needs.overdue.dismiss')}
                        </Button>
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
                  title={t('corpTaxBook.moons.needs.unmatched.title', {
                    amount: isk(item.payment.amount),
                    name: names.character(item.payment.characterId),
                  })}
                  body={t(
                    // From the book as it is now: a sender who has since joined a Miner is not a stranger.
                    view.miners.some((m) => m.characterIds.includes(item.payment.characterId))
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
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setOpen({ kind: 'notTax', item })}
                        >
                          {t('corpTaxBook.moons.needs.unmatched.notTax')}
                        </Button>
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
                  title={t('corpTaxBook.moons.needs.leaver.title', {
                    name: nameOf(item.minerId),
                    amount: isk(item.owed),
                  })}
                  body={t('corpTaxBook.moons.needs.leaver.body')}
                  actions={
                    canEdit && item.statementId ? (
                      <Button size="sm" onClick={() => setOpen({ kind: 'writeOff', item, miner })}>
                        {t('corpTaxBook.moons.needs.leaver.writeOff')}
                      </Button>
                    ) : null
                  }
                />
              );
            }
          }
        })}
      </div>
      {open?.kind === 'confirm' && (
        <RecordPaymentDialog
          open
          onClose={close}
          miner={open.miner}
          minerName={names.character(open.miner.mainCharacterId)}
          defaultAmount={open.item.owed}
          onRecorded={async () => {
            await edit({
              action: 'resolveDeclaration',
              declarationId: open.item.declaration.id,
              resolution: 'confirmed',
            });
          }}
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
    </div>
  );
}
