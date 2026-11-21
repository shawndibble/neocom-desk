import { useState, type ReactNode } from 'react';
import { useTimeZone } from '@/lib/timeFormat';
import { Link } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { Button, Panel, plainTextActionClassName } from '@/components/ui';
import { Pill } from '@/components/ui/Pill';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import type { MinerRow, NeedsYouItem } from '@/engine/corpTaxBook/bookView';
import type { UncountedDonation } from '@/engine/corpTaxBook/uncounted';
import {
  disputeHold,
  disputeKindOf,
  disputedTax,
  heldByStatement,
  type DisputeKind,
  type OreDispute,
} from '@/engine/corpTaxBook/disputes';
import type { ClaimedTransfer } from '@/engine/corpTaxBook/overdue';
import { useCharacters } from '@/features/character/useCharacters';
import { cx } from '@/lib/cx';
import { formatCount } from '@/lib/formatCount';
import { useNow } from '@/lib/useNow';
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
import { atDate, isk, periodLabel, shortDate, shortDateTime } from './moonsFormat';
import { autoCredited, paidToOwn, transferStatus, type TransferStatus } from './claimWalletCheck';
import { useOwnWalletJournals } from './useOwnWalletJournals';
import { MOONS_TABS, minerPath } from './moonsPaths';
import { tabPath } from '@/lib/pageTabs';
import { mailTarget, useCorporationName } from './statementMailing';
import { declaredLeft } from './declaredLeft';

/** The card's second action: a text link off the primary Button, so the pair is not two boxes (DESIGN.md §6, text action off a primary). */
const secondaryActionClassName = plainTextActionClassName('min-h-9 md:min-h-6');

function QueueCard({
  tone,
  title,
  body,
  detail,
  actions,
}: {
  tone: 'danger' | 'warning' | 'neutral';
  title: ReactNode;
  body: string;
  /** Under the body: a declaration's wallet check, a dispute's hold. */
  detail?: ReactNode;
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
        {detail}
      </span>
      <span className="flex shrink-0 flex-wrap items-center gap-2 max-sm:pl-3">{actions}</span>
    </li>
  );
}

function TransferLines({
  transfers,
  statuses,
}: {
  transfers: ClaimedTransfer[];
  statuses: (TransferStatus | undefined)[];
}) {
  const zone = useTimeZone();
  const { t } = useTranslation();
  return (
    <ul className="mt-1 space-y-0.5 text-xs text-text-dim">
      {transfers.map((tr, i) => {
        const st = statuses[i];
        return (
          <li key={tr.journalRef} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {st && <Pill tone={st.tone}>{st.label}</Pill>}
            <span className="tabular-nums">
              {t('corpTaxBook.moons.needs.declaration.transfer', {
                amount: isk(tr.amount),
                time: shortDateTime(tr.at, zone),
                ref: tr.journalRef,
              })}
            </span>
            {st?.note && <span>{st.note}</span>}
          </li>
        );
      })}
    </ul>
  );
}

const sumOf = (transfers: readonly ClaimedTransfer[]) =>
  transfers.reduce((n, tr) => n + tr.amount, 0);

/** A card's headline, a link to the Miner's page whenever the item has a Miner. */
function MinerTitle({ minerId, children }: { minerId: string | undefined; children: string }) {
  if (minerId === undefined) return <>{children}</>;
  return (
    <Link to={minerPath(minerId)} className={entityLinkClassName('inline-block py-0.5')}>
      {children}
    </Link>
  );
}

const D = 'corpTaxBook.moons.needs.dispute';

/** What each kind of dispute says on its card: one record, so nothing branches on the kind twice. */
const DISPUTE_COPY: Record<
  DisputeKind,
  {
    titleKey: (facts: { billed: number | undefined; priced: number | undefined }) => string;
    lineKey: string;
    bodyKey?: string;
    waiveKey: string;
  }
> = {
  payee: {
    titleKey: () => `${D}.title`,
    lineKey: `${D}.line`,
    bodyKey: `${D}.body`,
    waiveKey: `${D}.dismiss`,
  },
  quantity: {
    titleKey: () => `${D}.titleQuantity`,
    lineKey: `${D}.lineQuantity`,
    bodyKey: `${D}.bodyQuantity`,
    waiveKey: `${D}.waive`,
  },
  rate: {
    titleKey: ({ billed }) => (billed === undefined ? `${D}.titleRateUnknown` : `${D}.titleRate`),
    lineKey: `${D}.lineQuantity`,
    waiveKey: `${D}.waiveDifference`,
  },
  notPaying: {
    titleKey: ({ priced }) =>
      priced === undefined ? `${D}.titleNotPayingUnpriced` : `${D}.titleNotPaying`,
    lineKey: `${D}.lineQuantity`,
    waiveKey: `${D}.writeOff`,
  },
};

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
  const zone = useTimeZone();
  const { t } = useTranslation();
  const ctx = useBook();
  const { view, names, edit, canEdit, characterId, corporationId, settings } = ctx;
  const { miners } = useTabsProjection();
  const { needsYou, uncounted, disputes, noticesDue, count } = useNeedsYou();
  // The officer's own Characters on this device: a transfer paid to one is checked in its journal.
  const ownIds = new Set(useCharacters().map((c) => c.characterId));
  const journals = useOwnWalletJournals(
    needsYou.flatMap((item) =>
      item.kind === 'declaration'
        ? (item.declaration.transfers ?? []).flatMap((tr) => paidToOwn(tr, ownIds) ?? [])
        : []
    )
  );
  const [open, setOpen] = useState<Open>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const now = useNow();
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
    // The server adds `addDivision` to the list it stores, so another officer's concurrent change
    // is kept; `divisions` is only for a server that predates `addDivision` and ignores it. Drop
    // it once the functions with `addDivision` are deployed to production.
    return {
      addDivision: division,
      divisions,
      ...(divisionNames ? { divisionNames } : {}),
    };
  };
  const countDivision = async (division: number) => {
    setBusy(true);
    try {
      await edit({ action: 'updateSettings', patch: await countPatch(division) });
      setNotice(
        t('corpTaxBook.moons.needs.uncounted.counted', { division: divisionLabel(division) })
      );
    } catch {
      setNotice(t('corpTaxBook.moons.needs.uncounted.failed'));
    } finally {
      setBusy(false);
    }
  };
  const answerUncounted = async (u: UncountedDonation, how: 'count' | 'notTax') => {
    if (how === 'count') return countDivision(u.division);
    setBusy(true);
    try {
      await edit({ action: 'ignoreUncounted', uncountedId: u.id });
      setNotice(t('corpTaxBook.moons.needs.uncounted.ignored'));
    } catch {
      setNotice(t('corpTaxBook.moons.needs.uncounted.failed'));
    } finally {
      setBusy(false);
    }
  };
  const nextStepOf = (name: string) => ({
    label: t('corpTaxBook.moons.dialogs.nextStep.label', { name }),
    hint: t('corpTaxBook.moons.dialogs.nextStep.hint', { name }),
  });
  const corporationName = useCorporationName();
  const minerOf = (id: string) => miners.find((m) => m.id === id)!;
  const nameOf = (id: string) => names.character(minerOf(id).mainCharacterId);

  const creditedAutomatically = autoCredited(view.input.declarations, now).flatMap((d) => {
    const miner = miners.find((m) =>
      view.input.statements.some((s) => s.id === d.statementId && s.minerId === m.id)
    );
    if (!miner) return [];
    const transfers = d.transfers ?? [];
    const amount = d.amount ?? transfers.reduce((n, tr) => n + tr.amount, 0);
    return [{ d, miner, amount, at: transfers[0]?.at ?? d.at }];
  });

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
      {creditedAutomatically.map(({ d, miner, amount, at }) => (
        <p key={d.id} className="px-3 py-2 text-xs text-text-dim">
          <Trans
            t={t}
            i18nKey="corpTaxBook.moons.needs.autoCredited"
            values={{
              name: names.character(miner.mainCharacterId),
              amount: isk(amount),
              date: atDate(at, zone),
            }}
            components={{
              miner: (
                <Link
                  to={minerPath(miner.id)}
                  className={entityLinkClassName('inline-block py-0.5')}
                />
              ),
            }}
          />
        </p>
      ))}
      <ul className="divide-y divide-line">
        {noticesDue.length > 0 && (
          // #6294: a Miner who is behind gets a late notice, mailed from an officer's Character;
          // automatic sync never sends one.
          <QueueCard
            tone="warning"
            title={
              <Link
                to={tabPath(MOONS_TABS, 'statements')}
                className={entityLinkClassName('inline-block py-0.5')}
              >
                {t('corpTaxBook.moons.needs.noticesDue.title', { count: noticesDue.length })}
              </Link>
            }
            body={t('corpTaxBook.moons.needs.noticesDue.body', {
              amount: isk(noticesDue.reduce((sum, n) => sum + n.owed, 0)),
            })}
            actions={null}
          />
        )}
        {needsYou.map((item) => {
          switch (item.kind) {
            case 'declaration': {
              const miner = minerOf(item.minerId);
              const d = item.declaration;
              const transfers = d.transfers ?? [];
              const statuses = transfers.map((tr, k) =>
                transferStatus(t, tr, d.checks?.[k], miner.characterIds, ownIds, journals, zone)
              );
              const toYou = transfers.filter((tr) => paidToOwn(tr, ownIds) !== undefined);
              const paidToYou = toYou.length > 0;
              const ownStatuses = statuses.filter((st) => st?.own);
              const foundInYours =
                ownStatuses.length > 0 && ownStatuses.every((st) => st?.own?.found);
              const missingInYours = ownStatuses.some((st) => st?.own?.found === false);
              const divisionToCount = statuses.find((st) => st?.division !== undefined)?.division;
              const keepBill = () => setOpen({ kind: 'reject', item, miner });
              const record = () => setOpen({ kind: 'confirm', item, miner });
              const [primary, secondary] =
                paidToYou && foundInYours
                  ? [
                      { label: t('corpTaxBook.moons.needs.paidToYou.record'), run: record },
                      { label: t('corpTaxBook.moons.needs.paidToYou.notTax'), run: keepBill },
                    ]
                  : paidToYou && missingInYours
                    ? [
                        { label: t('corpTaxBook.moons.needs.declaration.reject'), run: keepBill },
                        { label: t('corpTaxBook.moons.needs.paidToYou.recordAnyway'), run: record },
                      ]
                    : [
                        { label: t('corpTaxBook.moons.needs.declaration.confirm'), run: record },
                        { label: t('corpTaxBook.moons.needs.declaration.reject'), run: keepBill },
                      ];
              return (
                <QueueCard
                  key={`d-${d.id}`}
                  tone="warning"
                  title={
                    <MinerTitle minerId={item.minerId}>
                      {paidToYou
                        ? t('corpTaxBook.moons.needs.paidToYou.title', {
                            name: nameOf(item.minerId),
                            // Only what went to this officer: the rest went to the corporation.
                            amount: isk(sumOf(toYou)),
                          })
                        : t('corpTaxBook.moons.needs.declaration.title', {
                            name: nameOf(item.minerId),
                            amount: isk(item.owed),
                          })}
                    </MinerTitle>
                  }
                  body={[
                    t('corpTaxBook.moons.needs.declaration.body', {
                      kind: t(`corpTaxBook.moons.needs.declaration.kind.${d.kind}`),
                      date: atDate(d.at, zone),
                    }),
                    // What is still to count: transfers the check found are credited already.
                    declaredLeft(d) !== undefined &&
                      t('corpTaxBook.moons.needs.declaration.declared', {
                        amount: isk(declaredLeft(d)!),
                      }),
                    d.note &&
                      t('corpTaxBook.moons.needs.declaration.note', {
                        note: d.note,
                      }),
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  detail={
                    transfers.length > 0 && (
                      <TransferLines transfers={transfers} statuses={statuses} />
                    )
                  }
                  actions={
                    canEdit ? (
                      <>
                        <Button size="sm" onClick={primary.run}>
                          {primary.label}
                        </Button>
                        <button
                          type="button"
                          className={secondaryActionClassName}
                          onClick={secondary.run}
                        >
                          {secondary.label}
                        </button>
                        {divisionToCount !== undefined && (
                          <button
                            type="button"
                            className={secondaryActionClassName}
                            disabled={busy}
                            onClick={() => void countDivision(divisionToCount)}
                          >
                            {t('corpTaxBook.moons.needs.declaration.count', {
                              division: divisionToCount,
                            })}
                          </button>
                        )}
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
                      date: atDate(item.payment.at, zone),
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
        {disputes.map((d) => {
          const kind = disputeKindOf(d);
          const name = names.character(d.by);
          const date = shortDate(d.date);
          const priced = disputedTax(d, view.charges);
          const billed = view.charges.find((c) => c.key === d.lines[0]?.recordKey)?.taxPct;
          const copy = DISPUTE_COPY[kind];
          const ore = d.lines
            .map((l) =>
              t(copy.lineKey, {
                quantity: formatCount(l.quantity),
                ore: names.ore(l.typeId),
                payee: l.payeeName,
              })
            )
            .join('; ');
          const title = t(copy.titleKey({ billed, priced }), {
            name,
            date,
            claimed: d.claimedPct,
            billed,
            amount: priced === undefined ? undefined : isk(priced),
            payee: [...new Set(d.lines.map((l) => l.payeeName))].join(', '),
          });
          const words = d.reason ?? d.note;
          const body = [
            copy.bodyKey && t(copy.bodyKey, { ore }),
            words && t('corpTaxBook.moons.needs.dispute.reason', { reason: words }),
          ]
            .filter(Boolean)
            .join(' ');
          const hold = disputeHold(d, new Date(now).toISOString());
          // What the hold did to this Miner's Statements: the part of the bill payments skip.
          const heldIsk = hold
            ? [
                ...heldByStatement(
                  view.input.statements.filter((s) => s.minerId === d.minerId),
                  [d],
                  new Set(),
                  new Date(now).toISOString()
                ).values(),
              ].reduce((n, v) => n + v, 0)
            : 0;
          const waiveLabel = t(copy.waiveKey);
          return (
            <QueueCard
              key={`p-${d.id}`}
              tone={kind === 'notPaying' ? 'neutral' : 'warning'}
              title={
                <MinerTitle
                  minerId={miners.some((m) => m.id === d.minerId) ? d.minerId : undefined}
                >
                  {title}
                </MinerTitle>
              }
              body={body}
              detail={
                hold && (
                  <span className="block text-xs text-text-dim">
                    {heldIsk > 0
                      ? t('corpTaxBook.moons.needs.dispute.heldAmount', {
                          amount: isk(heldIsk),
                          date: atDate(hold.until, zone),
                        })
                      : t('corpTaxBook.moons.needs.dispute.held', {
                          date: atDate(hold.until, zone),
                        })}
                  </span>
                )
              }
              actions={
                canEdit ? (
                  <>
                    <Button
                      size="sm"
                      onClick={() => setOpen({ kind: 'disputeDismiss', dispute: d })}
                    >
                      {waiveLabel}
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
          );
        })}
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
            body={t('corpTaxBook.moons.needs.uncounted.body', { date: atDate(u.at, zone) })}
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
          defaultAmount={
            declaredLeft(open.item.declaration) ??
            (open.item.declaration.transfers?.length
              ? sumOf(open.item.declaration.transfers)
              : open.item.owed)
          }
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
          nextStep={nextStepOf(names.character(open.miner.mainCharacterId))}
          run={async (reason, nextStep) => {
            await edit({
              action: 'resolveDeclaration',
              declarationId: open.item.declaration.id,
              resolution: 'rejected',
              reason,
              nextStep,
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
          nextStep={nextStepOf(names.character(open.dispute.by))}
          run={async (reason, nextStep) => {
            await edit({ action: 'rejectDispute', disputeId: open.dispute.id, reason, nextStep });
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
