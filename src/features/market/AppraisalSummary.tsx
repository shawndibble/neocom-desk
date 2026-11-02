/** The Appraisal result's summary: totals chips, hold line, notes and the Compare Hubs cards. */
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { cx } from '@/lib/cx';
import { useTranslation } from 'react-i18next';
import { Spinner } from '@/components/ui';
import { AssumesBaseStandingsNote } from '@/features/character/AssumesBaseStandingsNote';
import { ImplantsAssumedNote } from '@/features/character/ImplantsAssumedNote';
import type { appraisalNet } from '@/engine/market/appraisal';
import { AppraisalHeaderStats } from './AppraisalHeaderStats';
import { AppraisalHoldBar } from './AppraisalHoldBar';
import { HubCompareCards } from './HubCompareCards';
import { LivePriceBar, LivePriceStatus } from './LivePriceStatus';
import type { AppraisalController } from './useAppraisal';
import type { TradeHub } from '@/market/hubs';

interface AppraisalSummaryProps {
  result: NonNullable<AppraisalController['result']>;
  compare: AppraisalController['compare'];
  compareExpanded: boolean;
  loading: boolean;
  net: ReturnType<typeof appraisalNet> | null;
  itemCount: number;
  /** Rows carry refine data and the Refine column is shown. */
  showRefine: boolean;
  hasLpOption: boolean;
  /** The "Minus owned" provenance line; null when the filter is off. */
  minusOwnedLabel: string | null;
  cargo: Parameters<typeof AppraisalHoldBar>[0]['cargo'] | null;
  onCargoChange: Parameters<typeof AppraisalHoldBar>[0]['onCargoChange'];
  characterId: number | null;
  /** The hub the appraisal is quoted at; its Compare Hubs card reads as selected. */
  hubId: TradeHub['id'];
  /** A Compare Hubs card's click re-quotes the appraisal at that hub. */
  onHubChange: (id: TradeHub['id']) => void;
  /** Progress of the other hubs' live books, shown over the cards while they load. */
  compareLive: AppraisalController['compareLive'];
  /** The Refine figure's total efficiency, and the control that opens its breakdown. */
  refineEfficiency?: string | null;
  onOpenRefine?: () => void;
}

export function AppraisalSummary({
  result,
  compare,
  compareExpanded,
  loading,
  net,
  itemCount,
  showRefine,
  hasLpOption,
  minusOwnedLabel,
  cargo,
  onCargoChange,
  characterId,
  hubId,
  onHubChange,
  compareLive,
  refineEfficiency,
  onOpenRefine,
}: AppraisalSummaryProps) {
  const { t } = useTranslation();
  const totals = result.appraisal.totals;
  const implantBonusPct = result.implantBonusPct ?? 0;
  const refinesOreOrIce = result.refinesOreOrIce ?? false;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {minusOwnedLabel !== null && (
          <span className={cx(eyebrowClassName, 'w-full')}>{minusOwnedLabel}</span>
        )}
        <AppraisalHeaderStats
          totals={totals}
          net={net}
          itemCount={itemCount}
          showRefine={showRefine}
          showCheapest={hasLpOption}
          implantBonusPct={implantBonusPct}
          refineEfficiency={refineEfficiency}
          onOpenRefine={onOpenRefine}
          pricesUnavailable={result.pricesUnreachable}
        />
        {loading && <Spinner label={t('common.loading')} size="sm" />}
      </div>

      {cargo !== null && (
        <AppraisalHoldBar
          totals={totals}
          cargo={cargo}
          characterId={characterId}
          onCargoChange={onCargoChange}
        />
      )}

      {net && <AssumesBaseStandingsNote hint={t('market.appraisal.assumesBaseStandingsHint')} />}

      {showRefine && refinesOreOrIce && (
        <div className="empty:hidden">
          <ImplantsAssumedNote hint={t('market.appraisal.refineAssumesNoImplantsHint')} />
        </div>
      )}

      {result.pricesStale && (
        <p className="text-[0.6875rem] text-warning">{t('market.appraisal.pricesFromYesterday')}</p>
      )}
      {!result.pricesUnreachable && totals.unpricedRows > 0 && (
        <p className="text-[0.6875rem] text-warning">
          {t('market.appraisal.unpriced', { count: totals.unpricedRows })}
        </p>
      )}
      {!result.pricesUnreachable && totals.refineUnpricedRows > 0 && (
        <p className="text-[0.6875rem] text-warning">
          {t('market.appraisal.refineUnpriced', { count: totals.refineUnpricedRows })}
        </p>
      )}
      {compare !== null && compareExpanded && (
        // The same bar and text as the result table's, above the cards while the other hubs load.
        <div className="relative flex flex-col gap-2">
          {compareLive.checking && (
            <LivePriceBar live={compareLive} className="absolute inset-x-0 -top-2" />
          )}
          <LivePriceStatus live={compareLive} checkingOnly />
          <HubCompareCards rows={compare} selectedHubId={hubId} onSelectHub={onHubChange} />
        </div>
      )}
    </div>
  );
}
