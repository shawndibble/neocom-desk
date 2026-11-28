import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { fixed2 } from '@/lib/fixedFormat';
import { usePricesUnavailableLabel } from '@/features/market/usePricesUnavailableLabel';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from '@/lib/cx';
import {
  focusRingInsetClassName,
  hintCueClassName,
  rowInteractiveClassName,
} from '@/components/ui/controlStyles';
import { writeToClipboard } from '@/lib/clipboard';
import { formatIsk } from '@/lib/isk';
import { useCopyFeedback } from '@/lib/useCopyFeedback';
import { IskAmount, StatChip, StatChips, Tooltip } from '@/components/ui';
import { Toast } from '@/components/ui/Toast';
import type { AppraisalNetTotals, AppraisalTotals, RefineBasis } from '@/engine/market/appraisal';
import { iskToneClass } from '@/features/character/format';
import { AppraisalVolumeChip } from './AppraisalVolumeChip';
import { RefineChipValue } from './RefineChipValue';
import { approxIsk } from '@/features/campaigns/turnInContent';

const COPIED_FEEDBACK_MS = 2000;

export interface AppraisalTurnInTotal {
  total: number;
  count: number;
  onOpen: () => void;
}

interface AppraisalHeaderStatsProps {
  totals: AppraisalTotals;
  net: AppraisalNetTotals | null;
  itemCount: number;
  showRefine: boolean;
  refineValue: number;
  refineBasis: RefineBasis;
  showCheapest: boolean;
  implantBonusPct: number;
  refineEfficiency?: string | null;
  onOpenRefine?: () => void;
  turnIn?: AppraisalTurnInTotal | null;
  pricesUnavailable?: boolean;
}

const HEADLINE_SIZE_CLASS = 'text-xl @[29rem]:text-sm @[32rem]:text-base @[40rem]:text-xl';

interface SecondFigure {
  label: string;
  value: number;
  help?: string;
}

function useCopyFigure(value: number) {
  const { t } = useTranslation();
  const { copied, flash } = useCopyFeedback(COPIED_FEEDBACK_MS);
  const [copies, setCopies] = useState(0);
  const full = formatIsk(value, 0);
  const exact = t('common.iskExact', { amount: full });

  async function copy() {
    try {
      await writeToClipboard(full);
    } catch {
      return;
    }
    setCopies((n) => n + 1);
    flash();
  }

  return {
    full,
    exact,
    copy,
    copiedMessage: copied === null ? null : t('market.appraisal.copiedAmount', { amount: exact }),
    copies,
  };
}

type CopyFigure = ReturnType<typeof useCopyFigure>;

function CopiedFeedback({ figure }: { figure: CopyFigure }) {
  return figure.copiedMessage !== null ? (
    <Toast message={figure.copiedMessage} instance={figure.copies} />
  ) : null;
}

function SecondFigureArea({ title, second }: { title: string; second: SecondFigure }) {
  const { t } = useTranslation();
  const figure = useCopyFigure(second.value);
  return (
    <div className="relative border-t border-line">
      <Tooltip content={second.help} side="bottom">
        <button
          type="button"
          onClick={() => void figure.copy()}
          aria-label={t('market.appraisal.copyCardSecond', {
            title,
            label: second.label,
            amount: figure.exact,
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
      <CopiedFeedback figure={figure} />
    </div>
  );
}

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
        <h3 className={eyebrowClassName}>
          <button
            type="button"
            onClick={() => void total.copy()}
            aria-label={t('market.appraisal.copyCardTotal', { title, amount: total.exact })}
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
        <CopiedFeedback figure={total} />
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
  turnIn = null,
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
      {!pricesUnavailable && turnIn !== null && turnIn.count > 0 && (
        <StatChip
          label={t('market.appraisal.turnIn.chip')}
          value={
            <RefineChipValue
              amount={approxIsk(turnIn.total)}
              basis={t('market.appraisal.turnIn.items', { count: turnIn.count })}
              efficiency={null}
              onOpen={turnIn.onOpen}
              openLabel={t('market.appraisal.turnIn.openBreakdown')}
            />
          }
          tooltip={t('market.appraisal.turnIn.chipHelp')}
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
