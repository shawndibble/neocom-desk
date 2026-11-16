import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { Button, Panel, plainTextActionClassName } from '@/components/ui';
import { Pill, type PillTone } from '@/components/ui/Pill';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import type { MinerRow, NeedsYouItem } from '@/engine/corpTaxBook/bookView';
import type { UncountedDonation } from '@/engine/corpTaxBook/uncounted';
import {
  disputeHold,
  disputeKindOf,
  disputedTax,
  type OreDispute,
} from '@/engine/corpTaxBook/disputes';
import type { ClaimCheck, ClaimedTransfer } from '@/engine/corpTaxBook/overdue';
import { useCharacters } from '@/features/character/useCharacters';
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
import { isk, periodLabel, periodsLabel, shortDate, shortDateTime } from './moonsFormat';
import {
  autoCredited,
  findOwnEntry,
  oldestEntryDate,
  paidToOwn,
  type OwnJournal,
} from './claimWalletCheck';
import { useOwnWalletJournals } from './useOwnWalletJournals';
import { MOONS_TABS, minerPath } from './moonsPaths';
import { tabPath } from '@/lib/pageTabs';
import { mailTarget, useCorporationName } from './statementMailing';

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

const CHECK_TONE: Record<ClaimCheck['result'], PillTone> = {
  found: 'success',
  division: 'warning',
  notSynced: 'neutral',
  tooOld: 'neutral',
  notFound: 'danger',
  person: 'accent',
  otherCorp: 'warning',
};

/** What one claimed transfer's check came to, as the card shows it. */
interface TransferStatus {
  tone: PillTone;
  label: string;
  /** What the check found about it; the transfer's own amount, time and ref go beside it. */
  note?: string;
  division?: number;
  /** Paid to one of this officer's Characters: the own-wallet check decides, and it is found. */
  own?: { found: boolean };
}

function TransferLines({
  transfers,
  statuses,
}: {
  transfers: ClaimedTransfer[];
  statuses: (TransferStatus | undefined)[];
}) {
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
                time: shortDateTime(tr.at),
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
  const [now] = useState(() => Date.now());
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
  const answerUncounted = async (
    u: Pick<UncountedDonation, 'id' | 'division'>,
    how: 'count' | 'notTax'
  ) => {
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
  const nextStepOf = (name: string) => ({
    label: t('corpTaxBook.moons.dialogs.nextStep.label', { name }),
    hint: t('corpTaxBook.moons.dialogs.nextStep.hint', { name }),
  });
  const corporationName = useCorporationName();
  const minerOf = (id: string) => miners.find((m) => m.id === id)!;
  const nameOf = (id: string) => names.character(minerOf(id).mainCharacterId);

  /** What one claimed transfer's check, or its own-wallet check, found. */
  const statusOf = (
    tr: ClaimedTransfer,
    check: ClaimCheck | undefined,
    memberCharacterIds: readonly number[]
  ): TransferStatus | undefined => {
    const own = paidToOwn(tr, ownIds);
    if (own !== undefined) return ownStatus(tr, journals.get(own), memberCharacterIds);
    if (!check) return undefined;
    return {
      tone: CHECK_TONE[check.result],
      label:
        check.result === 'division'
          ? t('corpTaxBook.moons.needs.check.division', { division: check.division ?? '?' })
          : t(`corpTaxBook.moons.needs.check.${check.result}`),
      note: check.result === 'tooOld' ? t('corpTaxBook.moons.needs.check.tooOldBody') : undefined,
      division: check.result === 'division' ? check.division : undefined,
    };
  };
  const ownStatus = (
    tr: ClaimedTransfer,
    journal: OwnJournal | undefined,
    memberCharacterIds: readonly number[]
  ): TransferStatus => {
    if (journal === undefined)
      return { tone: 'neutral', label: t('corpTaxBook.moons.needs.paidToYou.reading') };
    if (journal.state !== 'ok')
      return {
        tone: 'neutral',
        label: t('corpTaxBook.moons.needs.paidToYou.noScope'),
        note: t('corpTaxBook.moons.needs.paidToYou.noScopeBody'),
      };
    const entry = findOwnEntry(journal.entries, tr, memberCharacterIds);
    if (entry)
      return {
        tone: 'success',
        label: t('corpTaxBook.moons.needs.paidToYou.found'),
        note: t('corpTaxBook.moons.needs.paidToYou.foundBody', {
          time: shortDateTime(entry.date),
          ref: entry.id,
        }),
        own: { found: true },
      };
    const oldest = oldestEntryDate(journal.entries);
    return {
      tone: 'danger',
      label: t('corpTaxBook.moons.needs.paidToYou.notFound'),
      note:
        oldest === undefined
          ? undefined
          : t('corpTaxBook.moons.needs.paidToYou.notFoundBody', { date: shortDate(oldest) }),
      own: { found: false },
    };
  };
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
              date: shortDate(at),
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
              const d = item.declaration;
              const transfers = d.transfers ?? [];
              const statuses = transfers.map((tr, k) =>
                statusOf(tr, d.checks?.[k], miner.characterIds)
              );
              const paidToYou = transfers.some((tr) => paidToOwn(tr, ownIds) !== undefined);
              const ownStatuses = statuses.filter((st) => st?.own);
              const foundInYours =
                ownStatuses.length > 0 && ownStatuses.every((st) => st?.own?.found);
              const missingInYours = ownStatuses.some((st) => st?.own?.found === false);
              const claimed = d.amount ?? (transfers.length > 0 ? sumOf(transfers) : item.owed);
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
                            amount: isk(claimed),
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
                      date: shortDate(d.at),
                    }),
                    d.amount !== undefined &&
                      t('corpTaxBook.moons.needs.declaration.declared', {
                        amount: isk(d.amount),
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
                            onClick={() =>
                              void answerUncounted({ id: d.id, division: divisionToCount }, 'count')
                            }
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
        {disputes.map((d) => {
          const kind = disputeKindOf(d);
          const name = names.character(d.by);
          const date = shortDate(d.date);
          const priced = disputedTax(d, view.charges);
          const billed = view.charges.find((c) => c.key === d.lines[0]?.recordKey)?.taxPct;
          const ore = d.lines
            .map((l) =>
              kind === 'payee'
                ? t('corpTaxBook.moons.needs.dispute.line', {
                    quantity: formatCount(l.quantity),
                    ore: names.ore(l.typeId),
                    payee: l.payeeName,
                  })
                : t('corpTaxBook.moons.needs.dispute.lineQuantity', {
                    quantity: formatCount(l.quantity),
                    ore: names.ore(l.typeId),
                  })
            )
            .join('; ');
          const title =
            kind === 'quantity'
              ? t('corpTaxBook.moons.needs.dispute.titleQuantity', { name, date })
              : kind === 'rate'
                ? billed === undefined
                  ? t('corpTaxBook.moons.needs.dispute.titleRateUnknown', {
                      name,
                      date,
                      claimed: d.claimedPct,
                    })
                  : t('corpTaxBook.moons.needs.dispute.titleRate', {
                      name,
                      date,
                      claimed: d.claimedPct,
                      billed,
                    })
                : kind === 'notPaying'
                  ? t(
                      priced === undefined
                        ? 'corpTaxBook.moons.needs.dispute.titleNotPayingUnpriced'
                        : 'corpTaxBook.moons.needs.dispute.titleNotPaying',
                      { name, date, amount: priced === undefined ? undefined : isk(priced) }
                    )
                  : t('corpTaxBook.moons.needs.dispute.title', {
                      name,
                      date,
                      payee: [...new Set(d.lines.map((l) => l.payeeName))].join(', '),
                    });
          const words = d.reason ?? d.note;
          const body = [
            kind === 'payee' && t('corpTaxBook.moons.needs.dispute.body', { ore }),
            kind === 'quantity' && t('corpTaxBook.moons.needs.dispute.bodyQuantity', { ore }),
            words && t('corpTaxBook.moons.needs.dispute.reason', { reason: words }),
          ]
            .filter(Boolean)
            .join(' ');
          const hold = disputeHold(d, new Date(now).toISOString());
          const waiveLabel = t(
            kind === 'quantity'
              ? 'corpTaxBook.moons.needs.dispute.waive'
              : kind === 'rate'
                ? 'corpTaxBook.moons.needs.dispute.waiveDifference'
                : kind === 'notPaying'
                  ? 'corpTaxBook.moons.needs.dispute.writeOff'
                  : 'corpTaxBook.moons.needs.dispute.dismiss'
          );
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
                    {t('corpTaxBook.moons.needs.dispute.held', { date: shortDate(hold.until) })}
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
          defaultAmount={
            open.item.declaration.amount ??
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
