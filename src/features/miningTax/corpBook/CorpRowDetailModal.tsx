import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, InfoTooltip, Modal } from '@/components/ui';
import { SecurityValue } from '@/features/assets/assetBrowserRows';
import { CharacterLink, SystemLink } from '@/features/entities';
import { formatAge } from '@/lib/age';
import { cx } from '@/lib/cx';
import { formatIsk } from '@/lib/isk';
import { useTicker } from '@/lib/ticker';
import { useIsPhone } from '@/lib/useIsPhone';
import { OreIcon, OreLink } from '../OreIcon';
import { typeLabel } from './typeLabel';
import { hubForPayee } from '../pricing';
import type { DisplayRow } from '../groupRows';
import { CorpBookDiffModal } from './CorpBookDiffModal';
import type { CorpBookViewBook } from './corpBookView';
import { CorpStatusPill } from './CorpStatusPill';
import { useCorpStateHint } from './useCorpStateText';
import type { CorpRowInfo } from './corpRows';

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
  /** The overlap notice for a day the miner's own list shares with the corporation's bill. */
  notice?: ReactNode;
}

/**
 * Row detail for a day the Corp Tax Book decided (#4065): the layout of
 * `RowDetailModal` for an owed row — who it is owed to and how much, the pilot
 * and system, the ore, how it was priced — with the book's status, locked
 * terms and any dispute added, and none of the Edit / Unassign actions: the
 * book owns these figures, not the member's Payees.
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
}: Props) {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  const hint = useCorpStateHint();
  const now = useTicker(60_000);
  const [comparing, setComparing] = useState(false);
  const { view } = corp;
  const hub = hubForPayee(view.hubId);
  const form = t(
    view.oreForm === 'compressed'
      ? 'miningTax.detail.breakdown.compressed'
      : 'miningTax.detail.breakdown.raw'
  );
  const owed = view.taxOwed ?? 0;
  const owing = view.state === 'billed' || view.state === 'sent-waiting';
  const scope = t(`miningTax.corpBook.rateScope.${view.rateScope}`);
  const synced = book?.summary.lastSyncedAt;
  const personal = view.personalOreLines;
  const payeeName = book?.payee.name ?? t('miningTax.corpBook.payeeName', { corp: corp.corpName });

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
            <span className="min-w-0 text-base font-semibold">{payeeName}</span>
            <span
              className={cx(
                'shrink-0 text-xl font-medium tabular-nums',
                owing && owed > 0 && 'text-isk-neg'
              )}
            >
              {view.taxOwed === null ? '—' : `${formatIsk(owed)} ISK`}
            </span>
          </div>
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
              {view.taxPct}%{' · '}
              {t('miningTax.detail.valueLine', { value: formatIsk(view.estimatedValue) })}
            </span>
            <CorpStatusPill corp={corp} />
          </div>

          <div className="space-y-1 rounded-xs border border-line bg-panel-2 p-2">
            <p className={eyebrowClassName}>{t('miningTax.oreColumn')}</p>
            <ul className="divide-y divide-line text-xs">
              {view.oreLines.map((line) => {
                const you = personal?.find((p) => p.typeId === line.typeId)?.quantity;
                return (
                  <li
                    key={line.typeId}
                    className="flex items-center gap-1.5 py-1 first:pt-0 last:pb-0"
                  >
                    <OreIcon typeId={line.typeId} size={32} className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">
                      <OreLink typeId={line.typeId}>{typeLabel(typeNames, line.typeId)}</OreLink>
                    </span>
                    <span className="text-text-dim tabular-nums">
                      {you !== undefined && you !== line.quantity
                        ? t('miningTax.corpBook.detail.bookAndYou', {
                            book: line.quantity.toLocaleString(),
                            you: you.toLocaleString(),
                          })
                        : line.quantity.toLocaleString()}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="space-y-1 rounded-xs border border-line bg-panel-2 p-2">
            <p className={eyebrowClassName}>{t('miningTax.detail.breakdown.title')}</p>
            <p className="text-xs text-text-dim">
              {t('miningTax.corpBook.detail.priced', {
                hub: hub.name,
                form,
                pct: view.taxPct,
                scope,
                from: view.rateEffectiveFrom ?? view.date,
              })}
            </p>
            <ul className="divide-y divide-line text-xs">
              {view.oreLines.map((line) => (
                <li key={line.typeId} className="flex flex-wrap items-baseline gap-x-2 py-1">
                  <span className="min-w-0 flex-1 truncate">
                    <OreLink typeId={line.typeId}>{typeLabel(typeNames, line.typeId)}</OreLink>
                  </span>
                  <span className="text-text-dim tabular-nums">
                    {line.quantity.toLocaleString()} ×{' '}
                    {formatIsk(view.unitPrices[line.typeId] ?? 0)}
                  </span>
                  <span className="text-text-dim">
                    {t(
                      `miningTax.detail.breakdown.source.${view.priceSources[line.typeId] ?? 'none'}`
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <p className="rounded-xs border border-line p-2 text-xs text-text-dim">
            {hint(corp)}{' '}
            {(view.state === 'billed' || view.state === 'sent-waiting' || view.state === 'paid') &&
              (view.statementId
                ? t('miningTax.corpBook.detail.onStatement', { corp: corp.corpName })
                : t('miningTax.corpBook.detail.decides', {
                    corp: corp.corpName,
                    ago: synced ? formatAge(Math.max(0, now - Date.parse(synced)), t) : '—',
                  }))}{' '}
            {t('miningTax.corpBook.detail.terms', {
              hub: hub.name,
              form,
              pct: view.taxPct,
              scope,
              from: view.rateEffectiveFrom ?? view.date,
            })}
          </p>

          {view.correction && (
            <p className="rounded-xs border border-line p-2 text-xs">
              {t('miningTax.corpBook.detail.corrected', {
                corp: corp.corpName,
                before: formatIsk(view.correction.before),
                after: formatIsk(view.correction.after),
              })}
            </p>
          )}

          {notice}

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
                        you: view.dispute.personalQuantity.toLocaleString(),
                        book: view.dispute.bookQuantity.toLocaleString(),
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
        />
      )}
    </>
  );
}
