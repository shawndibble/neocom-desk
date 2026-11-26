import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { usePricesUnavailableLabel } from '@/features/market/usePricesUnavailableLabel';
import { useTranslation } from 'react-i18next';
import { LiveStatus, Tooltip } from '@/components/ui';
import {
  focusRingClassName,
  interactiveClassName,
  rowInteractiveClassName,
  selectedRowClassName,
} from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import type { TradeHub } from '@/market/hubs';
import { writeToClipboard } from '@/lib/clipboard';
import { formatIsk, formatIskCompact } from '@/lib/isk';
import { useCopyFeedback } from '@/lib/useCopyFeedback';
import type { HubComparisonRow } from './appraisalData';
import { PriceMark } from './LivePriceStatus';

const COPIED_FEEDBACK_MS = 2000;

function CopyableTotal({
  value,
  copied,
  onCopied,
}: {
  value: number;
  copied: boolean;
  onCopied: () => void;
}) {
  const { t } = useTranslation();
  const exact = t('common.iskExact', { amount: formatIsk(value, 0) });

  async function copy() {
    await writeToClipboard(formatIsk(value, 0));
    onCopied();
  }

  return (
    <Tooltip content={copied ? t('market.appraisal.copiedToClipboard') : exact}>
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={t('market.appraisal.copyTotal', { amount: exact })}
        className={`relative rounded-xs text-left hover:text-accent ${interactiveClassName} ${focusRingClassName}`}
      >
        <span aria-hidden="true">{formatIskCompact(value)}</span>
      </button>
    </Tooltip>
  );
}

function HubFigure({
  label,
  shortLabel,
  value,
  state,
  copied,
  onCopied,
}: {
  label: string;
  shortLabel: string;
  value: number | null;
  state: HubComparisonRow['priceState'];
  copied: boolean;
  onCopied: () => void;
}) {
  return (
    <div className="min-w-0">
      <dt className={eyebrowClassName}>
        <span aria-hidden="true" className="sm:hidden">
          {shortLabel}
        </span>
        <span className="max-sm:hidden">{label}</span>
      </dt>
      <dd className="text-base text-text tabular-nums">
        <PriceMark state={state} />
        {value === null ? '—' : <CopyableTotal value={value} copied={copied} onCopied={onCopied} />}
      </dd>
    </div>
  );
}

type CopiedKey = `${string}:${'sell' | 'buy'}`;

export function HubCompareCards({
  rows,
  selectedHubId,
  onSelectHub,
}: {
  rows: readonly HubComparisonRow[];
  selectedHubId: TradeHub['id'];
  onSelectHub: (id: TradeHub['id']) => void;
}) {
  const { t } = useTranslation();
  const pricesUnavailableLabel = usePricesUnavailableLabel();
  const { copied, flash: announceCopied } = useCopyFeedback<CopiedKey>(COPIED_FEEDBACK_MS);

  return (
    <>
      <ul
        aria-label={t('market.appraisal.compareHubsTitle')}
        className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5"
      >
        {rows.map((row) => {
          const selected = row.hub.id === selectedHubId;
          return (
            <li
              key={row.hub.id}
              aria-current={selected ? 'true' : undefined}
              className={cx(
                'relative min-w-0 rounded-xs border border-l-2 border-line bg-panel/85 p-3 backdrop-blur-sm',
                rowInteractiveClassName,
                selected && selectedRowClassName
              )}
            >
              <p className="truncate text-sm font-semibold">
                <button
                  type="button"
                  aria-label={t('market.appraisal.appraiseAtHub', { hub: row.hub.systemName })}
                  onClick={() => {
                    if (!selected) onSelectHub(row.hub.id);
                  }}
                  className={cx(
                    'dt-primary max-w-full cursor-pointer truncate rounded-xs text-left text-text after:absolute after:inset-0',
                    focusRingClassName
                  )}
                >
                  {row.hub.systemName}
                </button>
              </p>
              <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-2 sm:grid-cols-1">
                <HubFigure
                  label={t('market.appraisal.sellTotal')}
                  shortLabel={t('market.appraisal.sellShort')}
                  value={row.sell}
                  state={row.priceState}
                  copied={copied === `${row.hub.id}:sell`}
                  onCopied={() => announceCopied(`${row.hub.id}:sell`)}
                />
                <HubFigure
                  label={t('market.appraisal.buyTotal')}
                  shortLabel={t('market.appraisal.buyShort')}
                  value={row.buy}
                  state={row.priceState}
                  copied={copied === `${row.hub.id}:buy`}
                  onCopied={() => announceCopied(`${row.hub.id}:buy`)}
                />
              </dl>
              {row.unreachable && (
                <p className="mt-2 text-[0.6875rem] text-text-dim">{pricesUnavailableLabel}</p>
              )}
            </li>
          );
        })}
      </ul>
      <LiveStatus>{copied === null ? '' : t('market.appraisal.copiedToClipboard')}</LiveStatus>
    </>
  );
}
