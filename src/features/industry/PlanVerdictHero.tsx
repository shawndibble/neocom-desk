import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { usePricesUnavailableLabel } from '@/features/market/usePricesUnavailableLabel';
import type { ReactElement, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  IconButton,
  InfoTooltip,
  IskAmount,
  Panel,
  Spinner,
  Tooltip,
} from '@/components/ui';
import { textActionClassName } from '@/components/ui/textActionClassName';
import { focusRingClassName } from '@/components/ui/controlStyles';
import * as Icon from '@/components/ui/icons';
import type { BuildResult } from '@/engine/industry/types';
import type { SkillGateVerdict } from '@/engine/industry/skillGate';
import type { ProfitBasis, ProfitOnBasis } from '@/engine/industry/profitBasis';
import { cx } from '@/lib/cx';
import { iskToneClass } from '@/features/character/format';
import { formatPercent } from './format';
import { isPriceSpike } from '@/engine/market/priceVsMedian';
import { CalculationBreakdown, type BreakdownContext } from './CalculationBreakdown';
import type { ItemMenuFor } from '@/features/market/ItemContextMenu';
import { Well } from '@/components/ui/Well';
import { SkillGateMarker } from './SkillGateMarker';

type PillTone = 'success' | 'warning' | 'muted';

const PILL_TONE: Record<PillTone, string> = {
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  muted: 'text-text-dim',
};

export function VerdictPill({
  label,
  tone,
  children,
}: {
  label: string;
  tone: PillTone;
  children: ReactNode;
}) {
  const Glyph = tone === 'warning' ? Icon.Warn : tone === 'success' ? Icon.Done : Icon.Tip;
  return (
    <p
      className={`inline-flex min-h-7 items-center gap-2 rounded-xs px-2.5 py-1 text-[0.6875rem] font-semibold tracking-widest uppercase ${PILL_TONE[tone]}`}
    >
      <Glyph size={Icon.ICON_SIZE.sm} aria-hidden="true" className="shrink-0" />
      <span className="sr-only">{label}</span>
      <span>{children}</span>
    </p>
  );
}

export function BpcCoverageWarning({
  coverage,
  blueprintName,
  onSetRuns,
}: {
  coverage: { coveredRuns: number; neededRuns: number };
  blueprintName: string;
  onSetRuns?: (runs: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <p className="text-xs text-warning" role="status">
      {t('industry.bpcCoverageWarning', {
        name: blueprintName,
        covered: coverage.coveredRuns,
        needed: coverage.neededRuns,
      })}
      {onSetRuns && (
        <>
          {' '}
          <button
            type="button"
            className={textActionClassName('inline-flex')}
            onClick={() => onSetRuns(coverage.coveredRuns)}
          >
            {t('industry.bpcCoverageSetRuns', { count: coverage.coveredRuns })}
          </button>
        </>
      )}
    </p>
  );
}

interface PlanVerdictHeroProps {
  result: BuildResult;
  figures: ProfitOnBasis;
  basis: ProfitBasis | null;
  onBasisChange?: (basis: ProfitBasis) => void;
  pricesReady: boolean;
  pricesUnreachable?: boolean;
  pricesLoading: boolean;
  productName: string;
  productTypeID?: number | null;
  vs90dPct?: number | null;
  costMoveNote?: ReactNode;
  itemMenuFor?: ItemMenuFor;
  itemActionsFor?: (typeId: number, bordered?: boolean) => ReactElement;
  runsControl?: ReactNode;
  bpcCoverage?: { coveredRuns: number; neededRuns: number } | null;
  blueprintName?: string;
  onSetRuns?: (runs: number) => void;
  breakdown: BreakdownContext;
  breakdownOpen: boolean;
  onBreakdownOpenChange: (open: boolean) => void;
  onLogProduction: () => void;
  logProductionDisabled?: boolean;
  skillGate?: SkillGateVerdict;
  nameForSkill?: (typeID: number) => string;
  nameForCharacter?: (characterId: number) => string;
  slotLine?: ReactNode;
  locationBlock?: ReactionLocationBlock;
  footer?: ReactNode;
  expansion?: ReactNode;
}

export interface ReactionLocationBlock {
  facilityName: string;
  systemName: string;
  fix: { systemName: string; onApply: () => void } | null;
  onChoose: () => void;
}

export function PlanVerdictHero({
  result,
  figures,
  basis,
  onBasisChange,
  pricesReady,
  pricesUnreachable = false,
  pricesLoading,
  productName,
  productTypeID,
  itemMenuFor,
  itemActionsFor,
  runsControl,
  bpcCoverage,
  blueprintName,
  onSetRuns,
  breakdown,
  breakdownOpen,
  onBreakdownOpenChange,
  onLogProduction,
  logProductionDisabled = false,
  skillGate,
  nameForSkill,
  nameForCharacter,
  slotLine,
  locationBlock,
  vs90dPct = null,
  costMoveNote,
  footer,
  expansion,
}: PlanVerdictHeroProps) {
  const { t } = useTranslation();
  const pricesUnavailableLabel = usePricesUnavailableLabel();

  const profit = pricesReady ? figures.profit : null;
  const hasItemActions = itemActionsFor !== undefined && productTypeID != null;

  const verdict = locationBlock ? (
    <VerdictPill label={t('industry.hero.verdictLabel')} tone="warning">
      {t('industry.reactionBlocked.verdict')}
    </VerdictPill>
  ) : figures.verdict === 'profitable' ? (
    <VerdictPill label={t('industry.hero.verdictLabel')} tone="success">
      {t('industry.hero.verdictProfitable')}
    </VerdictPill>
  ) : figures.verdict === 'closeCall' ? (
    <VerdictPill label={t('industry.hero.verdictLabel')} tone="warning">
      {t('industry.hero.verdictCloseCall')}
    </VerdictPill>
  ) : figures.verdict === 'loss' ? (
    <VerdictPill label={t('industry.hero.verdictLabel')} tone="warning">
      {basis === 'sellValue' && result.profit !== null && result.profit >= 0
        ? t('industry.hero.verdictSell')
        : t('industry.hero.verdictLoss')}
    </VerdictPill>
  ) : null;

  return (
    <Panel className="border-line-bright" padded={false}>
      <div className="flex flex-col gap-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
            {itemMenuFor && productTypeID != null ? (
              itemMenuFor(productTypeID, <h2 className="text-base font-semibold">{productName}</h2>)
            ) : (
              <h2 className="text-base font-semibold">{productName}</h2>
            )}
            {skillGate?.gated && nameForSkill && nameForCharacter && (
              <SkillGateMarker
                verdict={skillGate}
                nameForSkill={nameForSkill}
                nameForCharacter={nameForCharacter}
              />
            )}
            {runsControl}
            {slotLine}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Tooltip
              content={logProductionDisabled ? t('industry.logProductionNeedsProduct') : null}
            >
              <Button
                size="sm"
                variant="primary"
                onClick={onLogProduction}
                aria-disabled={logProductionDisabled || undefined}
              >
                <Icon.AddToPlan size={Icon.ICON_SIZE.sm} aria-hidden="true" />
                {t('industry.logProduction')}
              </Button>
            </Tooltip>
            {hasItemActions && itemActionsFor(productTypeID, true)}
          </div>
        </div>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:gap-10">
          <div className="flex min-w-0 flex-col items-start gap-1.5 lg:flex-1">
            {!pricesLoading && pricesReady && verdict}
            {pricesLoading ? (
              <div className="py-2">
                <Spinner size="sm" label={t('industry.pricesLoading')} />
              </div>
            ) : (
              <p
                className={cx(
                  'text-3xl leading-tight font-semibold tabular-nums',
                  profit === null ? 'text-text-dim' : iskToneClass(profit),
                  locationBlock && 'line-through opacity-60'
                )}
              >
                <span className="sr-only">{t('industry.hero.profitLabel')} </span>
                {profit === null ? (
                  t('common.unknown')
                ) : (
                  <>
                    <IskAmount value={profit} decimals={0} /> ISK
                  </>
                )}
              </p>
            )}
            {!pricesLoading && pricesReady && profit === null && bpcCoverage && blueprintName ? (
              <BpcCoverageWarning
                coverage={bpcCoverage}
                blueprintName={blueprintName}
                onSetRuns={onSetRuns}
              />
            ) : pricesLoading ? null : !pricesReady || profit === null ? (
              <p className="text-xs text-text-dim">
                {pricesUnreachable ? pricesUnavailableLabel : t('industry.heroNoPrices')}
              </p>
            ) : (
              <p className="text-sm text-text-dim">
                {basis === null ? (
                  t('industry.hero.leadPlain')
                ) : (
                  <>
                    {t('industry.hero.leadOwned')}{' '}
                    <Tooltip content={t('industry.hero.basisFlipHint')}>
                      <button
                        type="button"
                        className={cx(
                          'rounded-xs font-semibold text-accent hover:text-accent/80',
                          focusRingClassName
                        )}
                        onClick={() =>
                          onBasisChange?.(basis === 'sellValue' ? 'free' : 'sellValue')
                        }
                      >
                        {basis === 'sellValue'
                          ? t('industry.hero.basisSellValue')
                          : t('industry.hero.basisFree')}
                      </button>
                    </Tooltip>
                  </>
                )}
              </p>
            )}
            {!pricesLoading &&
              pricesReady &&
              profit !== null &&
              vs90dPct !== null &&
              isPriceSpike(vs90dPct) && (
                <p className="text-xs text-warning">
                  {t('industry.heroVs90dSpike', { value: `${Math.round(vs90dPct)}%` })}
                </p>
              )}
            {!pricesLoading && pricesReady && profit !== null && costMoveNote}
            {locationBlock && (
              <Well
                tone="warning"
                size="md"
                role="status"
                className="mt-1 flex flex-col items-start gap-2 text-xs text-warning"
              >
                <p>
                  {t('industry.reactionBlocked.callout', {
                    facility: locationBlock.facilityName,
                    system: locationBlock.systemName,
                  })}
                </p>
                <div className="flex flex-wrap gap-2">
                  {locationBlock.fix && (
                    <Button size="sm" variant="accent" onClick={locationBlock.fix.onApply}>
                      {t('industry.reactionBlocked.move', {
                        system: locationBlock.fix.systemName,
                      })}
                    </Button>
                  )}
                  <Button size="sm" onClick={locationBlock.onChoose}>
                    {t('industry.reactionBlocked.chooseLocation')}
                  </Button>
                </div>
              </Well>
            )}
          </div>

          {!pricesLoading && pricesReady && profit !== null && (
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:flex-1">
              <HeroStat label={t('industry.margin')}>
                {figures.marginPct === null ? '—' : formatPercent(figures.marginPct)}
              </HeroStat>
              <HeroStat
                label={t('industry.iskPerHour')}
                accessory={
                  <InfoTooltip
                    label={t('common.aboutLabel', { label: t('industry.iskPerHour') })}
                    content={t('industry.iskPerHourTooltip')}
                  />
                }
              >
                {figures.iskPerHour === null ? '—' : <IskAmount value={figures.iskPerHour} />}
              </HeroStat>
              <HeroStat
                label={t('industry.hero.breakEven')}
                accessory={
                  <IconButton
                    size="sm"
                    variant="plain"
                    icon={<Icon.Info size={Icon.ICON_SIZE.sm} />}
                    label={t('common.aboutLabel', { label: t('industry.hero.breakEven') })}
                    tooltip={t('industry.breakEvenPriceTooltip')}
                    onClick={() => onBreakdownOpenChange(true)}
                    aria-haspopup="dialog"
                  />
                }
                note={
                  figures.headroomPct === null ? null : (
                    <span
                      className={
                        figures.verdict === 'closeCall' || figures.headroomPct < 0
                          ? 'text-warning'
                          : undefined
                      }
                    >
                      {figures.headroomPct >= 0
                        ? t('industry.hero.underMarket', {
                            value: formatPercent(figures.headroomPct),
                          })
                        : t('industry.hero.overMarket', {
                            value: formatPercent(-figures.headroomPct),
                          })}
                    </span>
                  )
                }
              >
                {figures.breakEvenPrice === null ? (
                  '—'
                ) : (
                  <IskAmount value={figures.breakEvenPrice} />
                )}
              </HeroStat>
            </dl>
          )}
        </div>
      </div>

      {footer && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-b-xs border-t [&:has(+[data-state=open])]:rounded-b-none border-line bg-bg/40 px-4 py-2 text-xs text-text-dim">
          {footer}
        </div>
      )}
      {expansion}

      <CalculationBreakdown
        open={breakdownOpen}
        onClose={() => onBreakdownOpenChange(false)}
        result={result}
        context={breakdown}
      />
    </Panel>
  );
}

function HeroStat({
  label,
  accessory,
  note,
  children,
}: {
  label: string;
  accessory?: ReactNode;
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt
        className={cx(
          eyebrowClassName,
          'flex h-5 items-center gap-1 whitespace-nowrap [&>*]:-my-2'
        )}
      >
        {label}
        {accessory}
      </dt>
      <dd className="text-base font-semibold tabular-nums">{children}</dd>
      {note && <dd className="text-xs text-text-dim">{note}</dd>}
    </div>
  );
}
