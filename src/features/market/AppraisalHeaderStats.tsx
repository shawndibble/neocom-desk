/**
 * The Appraisal result's header: three plain numbers, Buy, Split and Sell,
 * each with the figure it nets to beneath it (Buy → selling into the buy
 * orders now, Sell → listing it yourself, Split → the spread), then one line of
 * cargo facts. Nothing dropped.
 */
import { fixed2 } from '@/lib/fixedFormat';
import { usePricesUnavailableLabel } from '@/features/market/usePricesUnavailableLabel';
import { useTranslation } from 'react-i18next';
import { cx } from '@/lib/cx';
import { focusRingInsetClassName, rowInteractiveClassName } from '@/components/ui/controlStyles';
import { writeToClipboard } from '@/lib/clipboard';
import { formatIsk } from '@/lib/isk';
import { useCopyFeedback } from '@/lib/useCopyFeedback';
import { IskAmount, StatChip, StatChips, Tooltip } from '@/components/ui';
import { hintCueClassName } from '@/components/ui/HintText';
import type { AppraisalNetTotals, AppraisalTotals, RefineBasis } from '@/engine/market/appraisal';
import { iskToneClass } from '@/features/character/format';
import { AppraisalVolumeChip } from './AppraisalVolumeChip';
import { RefineChipValue } from './RefineChipValue';

/** How long the "copied" bubble stays by the area that copied. */
const COPIED_FEEDBACK_MS = 2000;

interface AppraisalHeaderStatsProps {
  totals: AppraisalTotals;
  net: AppraisalNetTotals | null;
  itemCount: number;
  showRefine: boolean;
  /** The pile's refine total on the remembered price basis, and that basis, for the chip. */
  refineValue: number;
  refineBasis: RefineBasis;
  showCheapest: boolean;
  implantBonusPct: number;
  /** The total efficiency the Refine figure was worked out at ("68.3%"), shown beside it so the default is never silent. */
  refineEfficiency?: string | null;
  /** Opens the refine breakdown on the whole pile; absent, the chip has no control. */
  onOpenRefine?: () => void;
  /**
   * The price source could not be reached: the price-derived groups show a
   * placeholder instead of 0 ISK totals. Volume and item count need no price.
   */
  pricesUnavailable?: boolean;
}

/**
 * The headline's size by the header's own width, so a 13-digit total
 * ("1,234,567,890,123", about 8.5 times the font size wide) stays whole in a
 * third of it: full size where the cards stack (a phone) and from 40rem, and
 * in between stepped down, never below body size (`text-sm`). Each step leaves
 * a few percent spare for a wider system font.
 */
const HEADLINE_SIZE_CLASS =
  'text-xl @[29rem]:text-sm @[32rem]:text-base @[36rem]:text-lg @[40rem]:text-xl';

/** The figure a card nets to, under its divider. */
interface SecondFigure {
  label: string;
  value: number;
  /** What the label means; a tooltip on the area (hover, focus, touch-and-hold). */
  help?: string;
}

/** One copy area's state: the full digits, the copy, and whether its bubble shows. */
function useCopyFigure(value: number) {
  const { copied, flash } = useCopyFeedback(COPIED_FEEDBACK_MS);
  const full = formatIsk(value, 0);

  async function copy() {
    try {
      await writeToClipboard(full);
    } catch {
      return;
    }
    flash();
  }

  return { full, copied: copied !== null, copy };
}

/** Mounted only while showing, so six copy areas aren't six empty live regions. */
function CopiedBubble({ amount, className }: { amount: string; className: string }) {
  const { t } = useTranslation();
  return (
    <span
      role="status"
      className={cx(
        'pointer-events-none absolute left-1/2 z-10 -translate-x-1/2 rounded-xs border border-line bg-panel-2 px-2 py-0.5 text-[0.6875rem] font-medium whitespace-nowrap text-text normal-case shadow-md',
        className
      )}
    >
      {t('market.appraisal.copiedAmount', { amount })}
    </span>
  );
}

/**
 * The area under a card's divider: one button, label and figure, that copies
 * the figure. The label's tooltip sits on the button, so a hover or focus
 * shows it, a touch-and-hold reveals it, and a tap copies (DESIGN.md §6c).
 */
function SecondFigureArea({ title, second }: { title: string; second: SecondFigure }) {
  const { t } = useTranslation();
  const figure = useCopyFigure(second.value);
  const exact = t('common.iskExact', { amount: figure.full });
  return (
    <div className="relative border-t border-line">
      <Tooltip content={second.help}>
        <button
          type="button"
          onClick={() => void figure.copy()}
          aria-label={t('market.appraisal.copyCardSecond', {
            title,
            label: second.label,
            amount: exact,
          })}
          className={cx(
            'flex w-full cursor-copy flex-wrap items-baseline justify-between gap-x-2 rounded-b-xs px-2.5 pt-1 pb-2 text-left text-xs text-text-dim',
            focusRingInsetClassName,
            rowInteractiveClassName
          )}
        >
          <span className={second.help ? hintCueClassName : undefined}>{second.label}</span>
          <b className={cx('whitespace-nowrap tabular-nums', iskToneClass(second.value))}>
            {figure.full}
          </b>
        </button>
      </Tooltip>
      {figure.copied && <CopiedBubble amount={exact} className="top-full mt-1" />}
    </div>
  );
}

/**
 * One of the three headline numbers: label, figure, what it is, and the figure
 * it nets to. Two copy areas split at the divider. Above it, the title is the
 * button and its `::after` stretches over that area, so a press there copies
 * the headline. Below it, `SecondFigureArea` copies the second figure. Every
 * figure is printed in full.
 */
function PriceCell({
  title,
  hint,
  value,
  emphasis = false,
  second,
}: {
  title: string;
  hint: string;
  value: number;
  emphasis?: boolean;
  second?: SecondFigure | null;
}) {
  const { t } = useTranslation();
  const total = useCopyFigure(value);
  const exact = t('common.iskExact', { amount: total.full });

  return (
    <section
      aria-label={title}
      className="flex min-w-0 flex-col rounded-xs border border-line bg-panel"
    >
      <div
        className={cx(
          'relative flex flex-1 flex-col gap-0.5 px-2.5 pt-2 has-[button:focus-visible]:outline-2 has-[button:focus-visible]:-outline-offset-2 has-[button:focus-visible]:outline-accent',
          second ? 'rounded-t-xs' : 'rounded-xs pb-1',
          rowInteractiveClassName
        )}
      >
        <h3 className="text-[0.625rem] font-semibold tracking-widest text-text-dim uppercase">
          <button
            type="button"
            onClick={() => void total.copy()}
            aria-label={t('market.appraisal.copyCardTotal', { title, amount: exact })}
            className="cursor-copy rounded-xs uppercase tracking-widest after:absolute after:inset-0 focus-visible:outline-none"
          >
            {title}
          </button>
        </h3>
        <span
          className={cx(
            HEADLINE_SIZE_CLASS,
            'font-semibold whitespace-nowrap tabular-nums',
            emphasis ? 'text-accent' : 'text-text'
          )}
        >
          {total.full}
        </span>
        <span className="mb-1 text-[0.6875rem] text-text-dim">{hint}</span>
        {total.copied && <CopiedBubble amount={exact} className="bottom-full mb-1" />}
      </div>
      {second && <SecondFigureArea title={title} second={second} />}
    </section>
  );
}

export function AppraisalHeaderStats({
  totals,
  net,
  itemCount,
  showRefine,
  refineValue,
  refineBasis,
  showCheapest,
  implantBonusPct,
  refineEfficiency = null,
  onOpenRefine,
  pricesUnavailable = false,
}: AppraisalHeaderStatsProps) {
  const { t } = useTranslation();
  const pricesUnavailableLabel = usePricesUnavailableLabel();
  const facts = (
    <StatChips>
      <AppraisalVolumeChip totals={totals} />
      <StatChip label={t('market.appraisal.items')} value={itemCount} />
      {!pricesUnavailable && showRefine && (
        <StatChip
          label={t('market.appraisal.refineTotal')}
          value={
            <RefineChipValue
              amount={<IskAmount value={refineValue} decimals={0} />}
              basis={t(`market.appraisal.refineBasisShort.${refineBasis}`)}
              efficiency={refineEfficiency}
              onOpen={onOpenRefine}
            />
          }
          tooltip={
            implantBonusPct > 0
              ? `${t('market.appraisal.refineTotalHelp')} ${t('market.appraisal.refineImplantHint', { pct: implantBonusPct })}`
              : t('market.appraisal.refineTotalHelp')
          }
        />
      )}
      {!pricesUnavailable && showCheapest && (
        <StatChip
          label={t('market.appraisal.cheapestBuy')}
          value={<IskAmount value={totals.cheapestBuy} decimals={0} />}
          tone="accent"
          tooltip={t('market.appraisal.cheapestBuyHelp')}
        />
      )}
    </StatChips>
  );
  if (pricesUnavailable) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-text-dim">{pricesUnavailableLabel}</p>
        {facts}
      </div>
    );
  }
  return (
    <div className="@container flex w-full flex-col gap-2">
      {/* Three across from the width where a 13-digit total fits a card at body size; one per row below it. */}
      <div className="grid grid-cols-1 gap-2 @[29rem]:grid-cols-3">
        <PriceCell
          title={t('market.appraisal.summaryBuy')}
          hint={t('market.appraisal.summaryBuyHint')}
          value={totals.buy}
          second={
            net && {
              label: t('market.appraisal.summaryBuyNet'),
              value: net.instantNet,
              help: t('market.appraisal.instantNetHelp', { tax: fixed2(net.salesTaxPct) }),
            }
          }
        />
        <PriceCell
          title={t('market.appraisal.summarySplit')}
          hint={t('market.appraisal.summarySplitHint')}
          value={(totals.buy + totals.sell) / 2}
          emphasis
          second={{ label: t('market.appraisal.spread'), value: totals.spread }}
        />
        <PriceCell
          title={t('market.appraisal.summarySell')}
          hint={t('market.appraisal.summarySellHint')}
          value={totals.sell}
          second={
            net && {
              label: t('market.appraisal.summarySellNet'),
              value: net.listNet,
              help: t('market.appraisal.listNetHelp', {
                tax: fixed2(net.salesTaxPct),
                broker: fixed2(net.brokerFeePct),
              }),
            }
          }
        />
      </div>
      {facts}
    </div>
  );
}
