import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { useTimeZone } from '@/lib/timeFormat';
import { dateTimeAt } from '@/features/corp/moons/moonsFormat';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  InfoTooltip,
  Modal,
  ValueList,
  ValueRow,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
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
import type { ClosedDayPlan } from '@/engine/corpTaxBook/closedDayFix';
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
  onPay?: () => void;
  notice?: ReactNode;
  onResolve?: (target: ResolveTarget) => void;
  onFixRecords?: () => void;
  closedConflict?: ClosedDayPlan;
  onOpenLedger?: () => void;
  onEdit?: () => void;
  onSplit?: () => void;
}

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
  closedConflict,
  onOpenLedger,
  onEdit,
  onSplit,
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
  const owing = view.state === 'billed' || view.state === 'estimate';
  const scope = t(`miningTax.corpBook.rateScope.${view.rateScope}`);
  const synced = book?.summary.lastSyncedAt;
  const personal = view.personalOreLines;
  const payeeName = book?.payee.name ?? t('miningTax.corpBook.payeeName', { corp: corp.corpName });
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
  const conflict = view.state === 'conflict';
  const resolvable = rowTarget(view, undefined, closedConflict);
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
              {conflict
                ? `${formatIsk(view.billed)} ISK`
                : view.taxOwed === null
                  ? '—'
                  : `${formatIsk(owed)} ISK`}
            </span>
          </div>
          {conflict && (
            <p className="-mt-2 text-right text-xs text-warning">
              {t('miningTax.corpBook.conflict.headerNotOwed', { corp: corp.corpName })}
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
                  you !== undefined && line.quantity > you
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
                {view.state === 'estimate' && onEdit
                  ? t('miningTax.corpBook.detail.estimateOwn', { corp: corp.corpName })
                  : t('miningTax.corpBook.detail.lockedShort', { corp: corp.corpName })}
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
            {onEdit && (
              <div className="flex">
                <Button onClick={onEdit} className={onSplit ? 'rounded-r-none' : undefined}>
                  {t('miningTax.detail.editAction')}
                </Button>
                {onSplit && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <IconButton
                        icon={<Icon.Expanded />}
                        label={t('miningTax.detail.moreLabel')}
                        className="-ml-px rounded-l-none"
                      />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={onSplit}>
                        {t('miningTax.detail.splitAction')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
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
