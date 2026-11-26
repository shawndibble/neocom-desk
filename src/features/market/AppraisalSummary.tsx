import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { cx } from '@/lib/cx';
import { useTranslation } from 'react-i18next';
import { Spinner } from '@/components/ui';
import { AssumesBaseStandingsNote } from '@/features/character/AssumesBaseStandingsNote';
import { ImplantsAssumedNote } from '@/features/character/ImplantsAssumedNote';
import { type RefineBasis, type appraisalNet } from '@/engine/market/appraisal';
import { pileFigures } from '@/engine/market/appraisalRowFigures';
import { AppraisalHeaderStats, type AppraisalTurnInTotal } from './AppraisalHeaderStats';
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
  showRefine: boolean;
  hasLpOption: boolean;
  minusOwnedLabel: string | null;
  cargo: Parameters<typeof AppraisalHoldBar>[0]['cargo'] | null;
  onCargoChange: Parameters<typeof AppraisalHoldBar>[0]['onCargoChange'];
  characterId: number | null;
  hubId: TradeHub['id'];
  onHubChange: (id: TradeHub['id']) => void;
  compareLive: AppraisalController['compareLive'];
  refineEfficiency?: string | null;
  onOpenRefine?: () => void;
  refineBasis: RefineBasis;
  turnIn?: AppraisalTurnInTotal | null;
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
  refineBasis,
  turnIn = null,
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
          refineValue={pileFigures(result.appraisal.rows, refineBasis).refineMinerals}
          refineBasis={refineBasis}
          showCheapest={hasLpOption}
          implantBonusPct={implantBonusPct}
          refineEfficiency={refineEfficiency}
          onOpenRefine={onOpenRefine}
          turnIn={turnIn}
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
        <p className="text-[0.6875rem] text-warning">{t('market.appraisal.pricesFromSnapshot')}</p>
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
