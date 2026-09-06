import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Panel, Spinner } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import type { BuildResult } from '@/engine/industry/types';
import { compareUseOrSell, type OwnedStockSale } from '@/engine/industry/ownedStockSale';
import { formatDuration } from '@/lib/duration';
import { formatIsk } from '@/lib/isk';
import { iskToneClass } from '@/features/character/format';
import { formatPercent } from './format';
import { CalculationBreakdown, type BreakdownContext } from './CalculationBreakdown';

type PillTone = 'success' | 'warning' | 'muted';

const PILL_TONE: Record<PillTone, string> = {
  success: 'border-success/50 bg-success/10 text-success',
  warning: 'border-warning/50 bg-warning/10 text-warning',
  muted: 'border-line text-text-dim',
};

/**
 * One verdict as a pill. The heading (Acquisition Verdict, Sale
 * Profitability, Use-or-Sell) stays in the accessible name so the three read
 * as the separately-labelled statements ADR 0006 asks for, while the eye gets
 * the tone and the glyph — never colour alone (docs/DESIGN.md §7).
 */
function VerdictPill({
  label,
  tone,
  children,
}: {
  label: string;
  tone: PillTone;
  children: ReactNode;
}) {
  const Glyph = tone === 'warning' ? Icon.Warn : tone === 'success' ? Icon.Done : Icon.Info;
  return (
    <p
      className={`inline-flex min-h-7 items-center gap-2 rounded-xs border px-2.5 py-1 text-[0.6875rem] font-semibold tracking-wide uppercase ${PILL_TONE[tone]}`}
    >
      <Glyph size={Icon.ICON_SIZE.sm} aria-hidden="true" className="shrink-0" />
      <span className="sr-only">{label}</span>
      <span>{children}</span>
    </p>
  );
}

interface PlanVerdictHeroProps {
  result: BuildResult;
  pricesReady: boolean;
  pricesLoading: boolean;
  productName: string;
  runs: number;
  /** Both liquidation bases; the hero states the sell-now one. Null with no owned stock priced. */
  ownedSale: { instant: OwnedStockSale; order: OwnedStockSale } | null;
  breakdown: BreakdownContext;
  breakdownOpen: boolean;
  onBreakdownOpenChange: (open: boolean) => void;
  onLogProduction: () => void;
  logProductionDisabled?: boolean;
}

/**
 * The first thing a Build Plan shows: is this worth building? Net profit as
 * the one big number, the figures that qualify it on one line under it, and
 * the plan's verdicts as pills. Every number here is also in the Costs &
 * revenue ledger; this panel exists so the answer is read before the
 * working, not instead of it.
 */
export function PlanVerdictHero({
  result,
  pricesReady,
  pricesLoading,
  productName,
  runs,
  ownedSale,
  breakdown,
  breakdownOpen,
  onBreakdownOpenChange,
  onLogProduction,
  logProductionDisabled = false,
}: PlanVerdictHeroProps) {
  const { t } = useTranslation();

  const profit = pricesReady ? result.profit : null;
  const qualifiers = pricesReady
    ? [
        result.marginPct !== null &&
          t('industry.heroMargin', { value: formatPercent(result.marginPct) }),
        result.iskPerHour !== null &&
          t('industry.heroIskPerHour', { value: formatIsk(result.iskPerHour) }),
        formatDuration(result.seconds),
        result.breakEvenPrice !== null &&
          t('industry.heroBreakEven', { value: formatIsk(result.breakEvenPrice) }),
      ].filter((part): part is string => typeof part === 'string')
    : [formatDuration(result.seconds)];

  const useOrSell =
    pricesReady && ownedSale && ownedSale.instant.ownedUnits > 0
      ? { verdict: compareUseOrSell(result.profit, ownedSale.instant) }
      : null;

  return (
    <Panel className="border-line-bright">
      {/*
        Figure and pills share a row from `md`; the buttons join it only from
        `xl`. Below that they wrap under, so the panel can never be wider than
        its column — three fixed-width blocks side by side used to force the
        whole page to scroll sideways at ordinary desktop widths.
      */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-4 md:flex-row md:items-start md:gap-6">
          <div className="min-w-0 space-y-1 md:flex-1">
            <p className="flex flex-wrap items-baseline gap-x-1.5 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
              {/* A real heading, not decoration: it is what names the open plan to a screen reader. */}
              <h2 className="text-text">{productName}</h2>
              <span>· {t('industry.heroTitle', { count: runs })}</span>
            </p>
            {pricesLoading ? (
              <div className="py-2">
                <Spinner size="sm" label={t('industry.pricesLoading')} />
              </div>
            ) : (
              <p
                className={`text-3xl leading-tight font-semibold tabular-nums ${
                  profit === null ? 'text-text-dim' : iskToneClass(profit)
                }`}
              >
                {/* The figure is the Sale Profitability statement (ADR 0006) — labelled, not restated as a pill. */}
                <span className="sr-only">{t('industry.saleProfitabilityLabel')} </span>
                {profit === null ? t('common.unknown') : `${formatIsk(profit)} ISK`}
              </p>
            )}
            <p className="text-xs tabular-nums text-text-dim">
              {pricesLoading
                ? ''
                : !pricesReady || profit === null
                  ? t('industry.heroNoPrices')
                  : qualifiers.join(' · ')}
            </p>
          </div>

          {!pricesLoading && pricesReady && (
            <div className="flex min-w-0 flex-col items-start gap-2 md:flex-1">
              {result.recommendation === 'build' ? (
                <VerdictPill label={t('industry.acquisitionVerdictLabel')} tone="success">
                  {t('industry.verdictBuild', {
                    amount: formatIsk((result.buyCost ?? 0) - result.totalCost),
                  })}
                </VerdictPill>
              ) : result.recommendation === 'buy' ? (
                <VerdictPill label={t('industry.acquisitionVerdictLabel')} tone="warning">
                  {t('industry.verdictBuy', {
                    amount: formatIsk(result.totalCost - (result.buyCost ?? 0)),
                  })}
                </VerdictPill>
              ) : (
                <VerdictPill label={t('industry.acquisitionVerdictLabel')} tone="muted">
                  {t('industry.verdictUnknown')}
                </VerdictPill>
              )}

              {useOrSell &&
                (useOrSell.verdict === null ? (
                  <VerdictPill label={t('industry.useOrSell.label')} tone="muted">
                    {t('industry.useOrSell.unknown')}
                  </VerdictPill>
                ) : useOrSell.verdict.verdict === 'build' ? (
                  <VerdictPill label={t('industry.useOrSell.label')} tone="success">
                    {t('industry.useOrSell.verdictBuild', {
                      amount: formatIsk(useOrSell.verdict.advantage),
                    })}
                  </VerdictPill>
                ) : (
                  <VerdictPill label={t('industry.useOrSell.label')} tone="warning">
                    {t('industry.useOrSell.verdictSell', {
                      amount: formatIsk(Math.abs(useOrSell.verdict.advantage)),
                    })}
                  </VerdictPill>
                ))}
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap gap-2 xl:flex-col xl:items-end">
          <Button
            size="sm"
            onClick={() => onBreakdownOpenChange(true)}
            aria-haspopup="dialog"
            aria-expanded={breakdownOpen}
          >
            <Icon.Info size={Icon.ICON_SIZE.sm} aria-hidden="true" />
            {t('industry.breakdownTrigger')}
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={onLogProduction}
            disabled={logProductionDisabled}
          >
            <Icon.AddToPlan size={Icon.ICON_SIZE.sm} aria-hidden="true" />
            {t('industry.logProduction')}
          </Button>
        </div>
      </div>

      <CalculationBreakdown
        open={breakdownOpen}
        onClose={() => onBreakdownOpenChange(false)}
        result={result}
        context={breakdown}
      />
    </Panel>
  );
}
