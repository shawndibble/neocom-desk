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
import { SkillGateMarker } from './SkillGateMarker';

type PillTone = 'success' | 'warning' | 'muted';

const PILL_TONE: Record<PillTone, string> = {
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  muted: 'text-text-dim',
};

/**
 * One verdict as a pill. The heading stays in the accessible name so each
 * reads as a separately-labelled statement, while the eye gets the tone and
 * the glyph — never colour alone (docs/DESIGN.md §7).
 */
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

/** Names the real limit of an owned BPC the plan's runs exceed, with a one-click fix (issue #1775). */
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
  /**
   * The hero's figures on the chosen basis (`profitOnBasis`). The big
   * number, margin, ISK/hour, break-even and the verdict all follow it.
   */
  figures: ProfitOnBasis;
  /**
   * How owned materials are counted; `null` when the plan uses none, so
   * there is nothing to switch and the line under the figure says so.
   */
  basis: ProfitBasis | null;
  onBasisChange?: (basis: ProfitBasis) => void;
  pricesReady: boolean;
  /** The price source could not be reached: the no-price line says so rather than "No price data yet". */
  pricesUnreachable?: boolean;
  pricesLoading: boolean;
  productName: string;
  /** The product's typeID, for the heading's item context menu; null when the blueprint has no product. */
  productTypeID?: number | null;
  /**
   * The product's latest price vs its 90-day median at the plan's hub, in
   * percent; null or omitted when unknown. At the spike threshold or above,
   * an amber note under the figure warns the revenue may not last.
   */
  vs90dPct?: number | null;
  /** The 7-day input cost move line (`InputCostMoveLine`), beside the vs-90d note; omitted when there is none. */
  costMoveNote?: ReactNode;
  /** Wraps the product heading in the item context menu; omitted where the caller has none to offer. */
  itemMenuFor?: ItemMenuFor;
  /**
   * Visible "More actions" button beside the product heading (WCAG 2.1.1,
   * issue #1498). `bordered` asks for the ⋮ as a bordered button the height
   * of a small `Button`, to stand beside one.
   */
  itemActionsFor?: (typeId: number, bordered?: boolean) => ReactElement;
  /** The plan's runs field (and its Break Even shortcut), shown beside the product name. */
  runsControl?: ReactNode;
  /** The owned BPC's real run limit when the plan's runs exceed it and nothing extends it (issue #1775). */
  bpcCoverage?: { coveredRuns: number; neededRuns: number } | null;
  blueprintName?: string;
  onSetRuns?: (runs: number) => void;
  breakdown: BreakdownContext;
  breakdownOpen: boolean;
  onBreakdownOpenChange: (open: boolean) => void;
  onLogProduction: () => void;
  logProductionDisabled?: boolean;
  /** Account-wide skill gate on this plan's own product (issue #1231). */
  skillGate?: SkillGateVerdict;
  nameForSkill?: (typeID: number) => string;
  nameForCharacter?: (characterId: number) => string;
  /** The plan's slot schedule line; omitted when the caller has none. */
  slotLine?: ReactNode;
  /**
   * Set while the Reaction Location is highsec, where reactions cannot run
   * (issue #2908). Warns and offers the fix; blocks nothing.
   */
  locationBlock?: ReactionLocationBlock;
  /** The one-line setup summary under the verdict, with its Edit setup link. */
  footer?: ReactNode;
  /** The setup form that slides open under the footer, attached to this card. */
  expansion?: ReactNode;
}

export interface ReactionLocationBlock {
  /** The facility and system the reactions are planned at, for the callout. */
  facilityName: string;
  systemName: string;
  /** One-tap move to the nearest lowsec system; null when none is known. */
  fix: { systemName: string; onApply: () => void } | null;
  onChoose: () => void;
}

/**
 * The first thing a Build Plan shows: is this worth building? One verdict,
 * one big profit figure, the sentence that says what it is measured against,
 * then margin, ISK/hour and break-even. Status first, detail after: every
 * number here is also in the Costs & revenue ledger, which carries the
 * working (docs/context/decisions/20261024-163816-build-plan-page-reads-verdict-first-on-a.md).
 */
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
      {/* Only when the build itself pays: a plan that loses money even with its
          own stock counted free is a loss, not a reason to sell the stock. */}
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
            {/* A real heading: it is what names the open plan to a screen reader. */}
            {itemMenuFor && productTypeID != null ? (
              itemMenuFor(productTypeID, <h2 className="text-lg font-semibold">{productName}</h2>)
            ) : (
              <h2 className="text-lg font-semibold">{productName}</h2>
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
            <Button
              size="sm"
              variant="primary"
              onClick={onLogProduction}
              disabled={logProductionDisabled}
            >
              <Icon.AddToPlan size={Icon.ICON_SIZE.sm} aria-hidden="true" />
              {t('industry.logProduction')}
            </Button>
            {hasItemActions && itemActionsFor(productTypeID, true)}
          </div>
        </div>

        <div className="flex flex-col gap-4 md:flex-row md:items-end md:gap-10">
          <div className="flex min-w-0 flex-col items-start gap-1.5 md:flex-1">
            {!pricesLoading && pricesReady && verdict}
            {pricesLoading ? (
              <div className="py-2">
                <Spinner size="sm" label={t('industry.pricesLoading')} />
              </div>
            ) : (
              <p
                className={cx(
                  'text-4xl leading-tight font-semibold tabular-nums',
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
                    {basis === 'sellValue'
                      ? t('industry.hero.leadSellValue')
                      : t('industry.hero.leadFree')}{' '}
                    {/* §6c: accent text, no underline, tooltip naming the press — a value that flips in place. */}
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
              <div
                role="status"
                className="mt-1 flex flex-col items-start gap-2 rounded-xs border border-warning/40 bg-warning/10 p-2.5 text-xs text-warning"
              >
                <p>
                  {t('industry.reactionBlocked.callout', {
                    facility: locationBlock.facilityName,
                    system: locationBlock.systemName,
                  })}
                </p>
                <div className="flex flex-wrap gap-2">
                  {locationBlock.fix && (
                    <Button size="sm" variant="primary" onClick={locationBlock.fix.onApply}>
                      {t('industry.reactionBlocked.move', {
                        system: locationBlock.fix.systemName,
                      })}
                    </Button>
                  )}
                  <Button size="sm" onClick={locationBlock.onChoose}>
                    {t('industry.reactionBlocked.chooseLocation')}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {!pricesLoading && pricesReady && profit !== null && (
            <dl
              // Two columns on a phone: three left "BREAK-EVEN ⓘ" no room, and
              // it must not wrap (the labels share one baseline).
              className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:flex-1"
            >
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
                  // An ⓘ, not a "?": it opens the calculation (§6c).
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
  /** A tooltip or ⓘ beside the label. */
  accessory?: ReactNode;
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      {/* One fixed-height, non-wrapping label row, so a stat whose label
          carries an ⓘ or "?" lines up with one that carries none. */}
      <dt
        className={cx(
          eyebrowClassName,
          'flex h-5 items-center gap-1 whitespace-nowrap [&>*]:-my-2'
        )}
      >
        {label}
        {accessory}
      </dt>
      <dd className="text-lg font-semibold tabular-nums">{children}</dd>
      {note && <dd className="text-xs text-text-dim">{note}</dd>}
    </div>
  );
}
