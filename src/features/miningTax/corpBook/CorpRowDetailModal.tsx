import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { useTimeZone } from '@/lib/timeFormat';
import { dateTimeAt } from '@/features/corp/moons/moonsFormat';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, InfoTooltip, Modal, ValueList, ValueRow } from '@/components/ui';
import { SecurityValue } from '@/features/assets/assetBrowserRows';
import { CharacterLink, SystemLink } from '@/features/entities';
import { formatAge, MINUTE_MS } from '@/lib/age';
import { cx } from '@/lib/cx';
import { formatIsk } from '@/lib/isk';
import { useTicker } from '@/lib/ticker';
import { useIsPhone } from '@/lib/useIsPhone';
import { OrePricedCard } from '../OrePricedCard';
import { PayeeLedgerLink } from '../PayeeLedgerLink';
import { bookRowTax } from './corpRows';
import { typeLabel } from './typeLabel';
import { hubForPayee } from '../pricing';
import type { DisplayRow } from '../groupRows';
import { CorpBookDiffModal } from './CorpBookDiffModal';
import type { CorpBookViewBook } from './corpBookView';
import { CorpStatusPill } from './CorpStatusPill';
import { CorpDeclareSlot } from './CorpDeclareAction';
import {
  figureTarget,
  keptBy,
  rowTarget,
  unlinkedTarget,
  type ResolveTarget,
} from './resolve/targets';
import type { CorpRowInfo } from './corpRows';
import { formatCount } from '@/lib/formatCount';

interface Props {
  open: boolean;
  onClose: () => void;
  dr: DisplayRow;
  corp: Extract<CorpRowInfo, { kind: 'row' }>;
  book: CorpBookViewBook | undefined;
  systemName: string;
  systemSecurity: number | null | undefined;
  typeNames: ReadonlyMap<number, string>;
  /** Opens the corp pay dialog; absent when nothing is owed. */
  onPay?: () => void;
  /** The notice for a day the miner's own list shares with the corporation's bill: the overlap notice, or a Conflict's. */
  notice?: ReactNode;
  /** Opens the Resolve dialog (resolving in the app) on a problem of this row. Absent: none is offered. */
  onResolve?: (target: ResolveTarget) => void;
  /** Opens the member's own entry for this day, to fix their records. Absent: no entry lines up. */
  onFixRecords?: () => void;
  /** Opens this Payee's ledger, which lists every payment and the days it paid. Absent: no link. */
  onOpenLedger?: () => void;
}

/**
 * Row detail for a day the Corp Tax Book decided (#4065): the layout of
 * `RowDetailModal` for an owed row — who it is owed to and how much, the pilot
 * and system, the ore, how it was priced — with the book's status as a few
 * facts, a Conflict's notice first and any dispute added, and none of the
 * Edit / Unassign actions: the book owns these figures, not the member's Payees.
 */
export function CorpRowDetailModal({
  open,
  onClose,
  dr,
  corp,
  book,
  systemName,
  systemSecurity,
  typeNames,
  onPay,
  notice,
  onResolve,
  onFixRecords,
  onOpenLedger,
}: Props) {
  const zone = useTimeZone();
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  const now = useTicker(MINUTE_MS);
  const [comparing, setComparing] = useState(false);
  const { view } = corp;
  const hub = hubForPayee(view.hubId);
  const form = t(
    view.oreForm === 'compressed'
      ? 'miningTax.detail.breakdown.compressed'
      : 'miningTax.detail.breakdown.raw'
  );
  const owed = bookRowTax(view);
  const owing = view.state === 'billed';
  const scope = t(`miningTax.corpBook.rateScope.${view.rateScope}`);
  const synced = book?.summary.lastSyncedAt;
  const personal = view.personalOreLines;
  const payeeName = book?.payee.name ?? t('miningTax.corpBook.payeeName', { corp: corp.corpName });
  // The book's side of the day as a few labelled facts, not one run-on sentence.
  const facts: [string, string][] = [];
  if (view.noticeId && (view.state === 'billed' || view.state === 'paid')) {
    facts.push([
      t('miningTax.corpBook.detail.factNotice'),
      t('miningTax.corpBook.detail.factNoticeSent'),
    ]);
  } else if (view.state === 'billed') {
    facts.push([
      t('miningTax.corpBook.detail.factBilling'),
      t('miningTax.corpBook.detail.factBillingNext'),
    ]);
    facts.push([
      t('miningTax.corpBook.detail.factSynced'),
      synced ? formatAge(Math.max(0, now - Date.parse(synced)), t) : '—',
    ]);
  }
  if ((view.state === 'dismissed' || view.state === 'waived') && view.billed > 0) {
    facts.push([t('miningTax.corpBook.detail.factOriginal'), `${formatIsk(view.billed)} ISK`]);
  }
  // A conflict is the first thing to read and act on, so its notice leads.
  const conflict = view.state === 'conflict';
  // Ore listed beyond what the book recorded: the book never bills it.
  const excess = conflict && view.conflictCause === 'overListed';
  // #6206: "I paid this another way" on a day a Late notice asked for while it is still owed, and
  // what came of it. A day with an overlap says it in its notice instead.
  // What Resolve opens on for this day: an officer's kept bill, a Conflict, a figure that differs.
  const resolvable = rowTarget(view);
  const unlinked = unlinkedTarget(view);
  const declaring =
    onResolve !== undefined &&
    view.noticeId !== undefined &&
    !view.overlap &&
    (owing || view.declaration !== undefined);

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        placement={isPhone ? 'sheet' : 'center'}
        title={
          <span className="flex items-center gap-1.5">
            {t('miningTax.detailTitle', { date: view.date, system: systemName })}
            <SecurityValue security={systemSecurity} />
            <InfoTooltip
              label={t('common.aboutLabel', { label: t('miningTax.dateColumn') })}
              content={t('miningTax.dateEveHint')}
            />
          </span>
        }
      >
        <div className="space-y-3 text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <PayeeLedgerLink
              name={payeeName}
              className="min-w-0 text-left text-base font-semibold"
              onOpenLedger={onOpenLedger}
            />
            <span
              className={cx(
                'shrink-0 text-xl font-medium tabular-nums',
                owing && owed > 0 && 'text-isk-neg',
                conflict && 'text-text-dim'
              )}
            >
              {/* A Conflict is not owed yet, but shows what the book bills if it is left. */}
              {conflict && !excess
                ? `${formatIsk(view.billed)} ISK`
                : excess
                  ? '—'
                  : view.taxOwed === null
                    ? '—'
                    : `${formatIsk(owed)} ISK`}
            </span>
          </div>
          {view.state === 'settling' && (
            <p className="-mt-2 text-right text-xs text-text-dim">
              {t('miningTax.corpBook.conflict.settlingNote', {
                corp: corp.corpName,
                day: view.date,
              })}
            </p>
          )}
          {conflict && (
            <p className="-mt-2 text-right text-xs text-warning">
              {t(
                excess
                  ? 'miningTax.corpBook.conflict.headerNotBilled'
                  : 'miningTax.corpBook.conflict.headerNotOwed',
                { corp: corp.corpName }
              )}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-text-dim">
            <span>
              <CharacterLink id={view.characterId}>{dr.row.characterName}</CharacterLink>
              {view.solarSystemId > 0 && (
                <>
                  {' · '}
                  <SystemLink systemId={view.solarSystemId}>{systemName}</SystemLink>
                </>
              )}
              {' · '}
              {t('miningTax.detail.valueLine', { value: formatIsk(view.estimatedValue) })}
            </span>
            <CorpStatusPill corp={corp} />
          </div>

          {conflict && notice}

          <OrePricedCard
            title={t('miningTax.oreColumn')}
            lines={view.oreLines.map((line) => {
              const you = personal?.find((p) => p.typeId === line.typeId)?.quantity;
              const source = view.priceSources[line.typeId] ?? 'none';
              return {
                typeId: line.typeId,
                name: typeLabel(typeNames, line.typeId),
                quantity:
                  you !== undefined && you !== line.quantity
                    ? t('miningTax.corpBook.detail.bookAndYou', {
                        book: formatCount(line.quantity),
                        you: formatCount(you),
                      })
                    : formatCount(line.quantity),
                unit: formatIsk(view.unitPrices[line.typeId] ?? 0),
                source:
                  source === 'saved' ? undefined : t(`miningTax.detail.breakdown.source.${source}`),
              };
            })}
            note={t('miningTax.corpBook.detail.priced', {
              hub: hub.name,
              form,
              pct: view.taxPct,
              scope,
              from: view.rateEffectiveFrom ?? view.date,
            })}
          />

          {/* On a Conflict with nothing else to say, the notice already names who to ask. */}
          {!(conflict && facts.length === 0) && (
            <div className="space-y-1.5 rounded-xs border border-line p-2 text-xs">
              <p className={eyebrowClassName}>{t('miningTax.corpBook.detail.bookTitle')}</p>
              {facts.length > 0 && (
                <ValueList variant="plain" className="text-xs">
                  {facts.map(([label, value]) => (
                    <ValueRow key={label} label={label} value={value} />
                  ))}
                </ValueList>
              )}
              {/* Why a day the member saw Paid is Billed again, and the transfer to dispute. */}
              {view.unlinkedDonation && (
                <div className="space-y-1.5">
                  <p className="text-warning">
                    {t('miningTax.corpBook.detail.unlinkedDonation', {
                      corp: corp.corpName,
                      amount: formatIsk(view.unlinkedDonation.amount, 0),
                      time: dateTimeAt(view.unlinkedDonation.at, zone),
                    })}
                  </p>
                  {onResolve && unlinked && (
                    <Button size="sm" onClick={() => onResolve(unlinked)}>
                      {t('miningTax.resolve.open')}
                    </Button>
                  )}
                </div>
              )}
              {/* An officer kept the bill on a billed day: their reason and next step, word for word. */}
              {view.flagged?.state === 'rejected' && keptBy(view) === 'dispute' && (
                <div className="space-y-1">
                  <p className="text-warning">
                    {t('miningTax.corpBook.conflict.toldRejected', {
                      corp: corp.corpName,
                      reason: view.flagged.reason ?? '',
                    })}
                  </p>
                  {view.flagged.nextStep && (
                    <p className="font-semibold text-text">
                      {t('miningTax.resolve.facts.nextStep', { step: view.flagged.nextStep })}
                    </p>
                  )}
                </div>
              )}
              {declaring && <CorpDeclareSlot view={view} onResolve={onResolve} />}
              {(view.state === 'dismissed' || view.state === 'waived') && view.dismissalReason && (
                <p>{t('miningTax.corpBook.detail.reason', { reasons: view.dismissalReason })}</p>
              )}
              <p className="text-text-dim">
                {t('miningTax.corpBook.detail.lockedShort', { corp: corp.corpName })}
              </p>
              {onResolve && resolvable && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-text-dim">
                    {t('miningTax.corpBook.detail.lockedResolve', { corp: corp.corpName })}
                  </span>
                  <Button size="sm" onClick={() => onResolve(resolvable)}>
                    {t('miningTax.resolve.open')}
                  </Button>
                </div>
              )}
            </div>
          )}

          {view.correction && (
            <p className="rounded-xs border border-line p-2 text-xs">
              {t('miningTax.corpBook.detail.corrected', {
                before: formatIsk(view.correction.before),
                after: formatIsk(view.correction.after),
              })}
              {view.correction.reasons.length > 0 &&
                ` ${t('miningTax.corpBook.detail.reason', {
                  reasons: view.correction.reasons.join(' · '),
                })}`}
            </p>
          )}

          {view.forgivenIsk !== undefined && view.forgivenIsk >= 1 && (
            <p className="text-xs text-text-dim tabular-nums">
              {t('miningTax.corpBook.detail.forgiven', { amount: formatIsk(view.forgivenIsk) })}
            </p>
          )}

          {view.reversedCorrections?.map((r, i) => (
            <p key={i} className="rounded-xs border border-line p-2 text-xs text-text-dim">
              <span className="line-through decoration-text-faint">
                {formatIsk(r.amount)} ({r.reason})
              </span>{' '}
              {t('miningTax.corpBook.detail.reversedTag')}: {r.reversedReason}
            </p>
          ))}

          {!conflict && notice}

          {view.dispute && (
            <div className="space-y-2 rounded-xs border border-warning/60 bg-warning/10 p-2 text-xs">
              <p className="font-semibold text-warning uppercase">
                {view.dispute.rate && !view.dispute.quantity
                  ? t('miningTax.corpBook.disputed.rate', {
                      you: view.dispute.personalPct,
                      book: view.dispute.bookPct,
                    })
                  : view.dispute.quantity && !view.dispute.rate
                    ? t('miningTax.corpBook.disputed.quantity', {
                        you: formatCount(view.dispute.personalQuantity),
                        book: formatCount(view.dispute.bookQuantity),
                      })
                    : t('miningTax.corpBook.disputed.both')}
              </p>
              <p className="text-text-dim">{t('miningTax.corpBook.detail.disputeHint')}</p>
              <Button size="sm" onClick={() => setComparing(true)}>
                {t('miningTax.corpBook.diff.open')}
              </Button>
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            {owing && owed > 0 && onPay && (
              <Button variant="primary" onClick={onPay}>
                {t('miningTax.settleUpAction')}
              </Button>
            )}
            <Button className="ml-auto" onClick={onClose}>
              {t('common.close')}
            </Button>
          </div>
        </div>
      </Modal>
      {view.dispute && (
        <CorpBookDiffModal
          open={comparing}
          onClose={() => setComparing(false)}
          view={view}
          systemName={systemName}
          typeNames={typeNames}
          {...(onResolve
            ? {
                onResolve: () => {
                  setComparing(false);
                  onResolve(resolvable ?? figureTarget(view));
                },
              }
            : {})}
          {...(onFixRecords
            ? {
                onFixRecords: () => {
                  setComparing(false);
                  onFixRecords();
                },
              }
            : {})}
        />
      )}
    </>
  );
}
