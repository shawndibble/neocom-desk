import { useMemo } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import {
  Button,
  DataTable,
  EmptyState,
  IconButton,
  IskAmount,
  LoadFailedState,
  Panel,
  Tooltip,
  type DataTableColumn,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import {
  FALLBACK_FLOOR_SHARE,
  type SpendFloor,
  type SpendPlanRow,
  type SpendStop,
} from '@/engine/loyalty/spendPlan';
import { formatCount } from '@/lib/formatCount';
import { formatIskCompact } from '@/lib/isk';
import type { AsyncLoad } from '@/lib/useAsyncLoad';
import type { LoyaltyOfferRow } from './offerRows';
import { formatIskPerLp } from './offerRowDisplay';
import type { SpendPlanView } from './useSpendPlan';
import { stockLocationLabel } from '@/features/industry/ownedStockDetection';
import type { Translate } from '@/lib/translate';

const noteClassName = 'text-[0.6875rem] text-text-dim';

export function SpendLpButton({
  playerLp,
  lpAccess = null,
  rankable,
  loading,
  onClick,
}: {
  playerLp: number | null;
  lpAccess?: 'signedOut' | 'noScope' | null;
  rankable: boolean;
  loading: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  const reason =
    playerLp === null
      ? lpAccess === 'signedOut'
        ? t('loyaltyStore.spendPlan.lpSignedOut')
        : lpAccess === 'noScope'
          ? t('loyaltyStore.spendPlan.lpNoScope')
          : t('loyaltyStore.spendPlan.lpUnknown')
      : playerLp <= 0
        ? t('loyaltyStore.spendPlan.lpNone')
        : !rankable
          ? t('loyaltyStore.spendPlan.noRankedOffers')
          : null;
  if (reason !== null) {
    return (
      <Tooltip content={reason}>
        <Button size="sm" aria-disabled="true">
          {t('loyaltyStore.spendPlan.action')}
        </Button>
      </Tooltip>
    );
  }
  return (
    <Tooltip content={t('loyaltyStore.spendPlan.actionHint')}>
      <Button size="sm" loading={loading} onClick={onClick}>
        {t('loyaltyStore.spendPlan.actionWithLp', { lp: formatCount(playerLp!) })}
      </Button>
    </Tooltip>
  );
}

type PlanRow = SpendPlanRow & { row: LoyaltyOfferRow };

const FLOOR_KEYS = {
  yours: 'loyaltyStore.spendPlan.stopFloorYours',
  market: 'loyaltyStore.spendPlan.stopFloorMarket',
  best: 'loyaltyStore.spendPlan.stopFloorBest',
} as const satisfies Record<SpendFloor['source'], string>;

function turnInsToBuy(r: PlanRow): string[] {
  return r.turnIns
    .filter((line) => line.bought > 0)
    .map((line) => {
      const name = r.row.requiredItems.find((item) => item.typeId === line.typeId)?.name;
      return `${formatCount(line.bought)}× ${name ?? `#${line.typeId}`}`;
    });
}

function ownedNote(r: PlanRow, view: SpendPlanView, t: Translate): string | null {
  const owned = r.turnIns.reduce((sum, line) => sum + line.owned, 0);
  if (owned <= 0) return null;
  const unitsByLabel = new Map<string, number>();
  for (const line of r.turnIns) {
    if (line.owned <= 0) continue;
    for (const placement of view.ownedPlacements.get(line.typeId) ?? []) {
      const label = stockLocationLabel(placement, view.locationNames, t);
      unitsByLabel.set(label, (unitsByLabel.get(label) ?? 0) + placement.quantity);
    }
  }
  const labels = [...unitsByLabel].sort((a, b) => b[1] - a[1]).map(([label]) => label);
  if (labels.length === 0) return t('loyaltyStore.spendPlan.ownedUsed', { count: owned });
  return labels.length === 1
    ? t('loyaltyStore.spendPlan.ownedAt', { count: owned, place: labels[0] })
    : t('loyaltyStore.spendPlan.ownedAtMore', {
        count: owned,
        place: labels[0],
        more: labels.length - 1,
      });
}

function StopLine({ stop, view }: { stop: SpendStop; view: SpendPlanView }) {
  const { t } = useTranslation();
  const name = stop.offerId === null ? null : (view.rowsById.get(stop.offerId)?.itemName ?? null);
  const rate = stop.iskPerLp === null ? '' : formatIskPerLp(stop.iskPerLp);
  let text: string;
  switch (stop.reason) {
    case 'lpExhausted':
      text = t('loyaltyStore.spendPlan.stopLp', { lp: formatCount(view.result.lpLeft), name });
      break;
    case 'nothingProfitable':
      text =
        view.candidates === 0
          ? t('loyaltyStore.spendPlan.noRankedOffers')
          : name === null
            ? t('loyaltyStore.spendPlan.stopUnpriced')
            : t('loyaltyStore.spendPlan.stopLoss', { name });
      break;
    case 'wallet':
      text = t('loyaltyStore.spendPlan.stopWallet', {
        name,
        wallet: formatIskCompact(view.walletBalance ?? 0),
      });
      break;
    case 'belowFloor': {
      const floor = stop.floor!;
      text = t(FLOOR_KEYS[floor.source], {
        name,
        rate,
        floor: formatIskPerLp(floor.rate),
        best: floor.source === 'best' ? formatIskPerLp(floor.best) : '',
        share: Math.round(FALLBACK_FLOOR_SHARE * 100),
      });
      break;
    }
  }
  return <p className={noteClassName}>{text}</p>;
}

function PlanBody({
  view,
  playerLp,
  onSelectOffer,
}: {
  view: SpendPlanView;
  playerLp: number | null;
  onSelectOffer: (row: LoyaltyOfferRow) => void;
}) {
  const { t } = useTranslation();
  const { result } = view;
  const planRows = useMemo<PlanRow[]>(
    () =>
      result.rows.flatMap((r) => {
        const row = view.rowsById.get(r.offerId);
        return row ? [{ ...r, row }] : [];
      }),
    [result.rows, view.rowsById]
  );
  const columns = useMemo<DataTableColumn<PlanRow>[]>(
    () => [
      {
        id: 'offer',
        header: t('loyaltyStore.spendPlan.colOffer'),
        primary: true,
        render: (r) => <span className="truncate">{r.row.itemName}</span>,
      },
      {
        id: 'times',
        header: t('loyaltyStore.spendPlan.colTimes'),
        align: 'right',
        render: (r) => `×${formatCount(r.redemptions)}`,
      },
      {
        id: 'lp',
        header: t('loyaltyStore.spendPlan.colLp'),
        align: 'right',
        render: (r) => formatCount(r.lpSpent),
      },
      {
        id: 'iskCost',
        header: t('loyaltyStore.spendPlan.colIskCost'),
        align: 'right',
        render: (r) => <IskAmount value={r.iskCost} decimals={0} />,
      },
      {
        id: 'turnIns',
        header: t('loyaltyStore.spendPlan.colTurnIns'),
        align: 'right',
        render: (r) => {
          if (r.turnIns.length === 0) return '—';
          const ownedLabel = ownedNote(r, view, t);
          const toBuy = turnInsToBuy(r);
          return (
            <span className="inline-flex flex-col items-end">
              <IskAmount value={r.turnInsCost} decimals={0} />
              {toBuy.length > 0 && <span className={noteClassName}>{toBuy.join(', ')}</span>}
              {ownedLabel !== null && <span className={noteClassName}>{ownedLabel}</span>}
            </span>
          );
        },
      },
      {
        id: 'income',
        header: t('loyaltyStore.spendPlan.colIncome'),
        align: 'right',
        render: (r) => <IskAmount value={r.income} decimals={0} className="text-isk-pos" />,
      },
    ],
    [t, view]
  );

  if (result.rows.length === 0) {
    return (
      <EmptyState
        title={
          result.stop.reason === 'nothingProfitable' && view.candidates > 0
            ? t('loyaltyStore.spendPlan.empty')
            : t('loyaltyStore.spendPlan.emptyStopped')
        }
        hint={<StopLine stop={result.stop} view={view} />}
      />
    );
  }

  return (
    <div className="flex flex-col">
      <p className="px-3 py-2 text-xs">
        <Trans
          i18nKey="loyaltyStore.spendPlan.headline"
          values={{
            spent: formatCount(result.totals.lpSpent),
            balance: formatCount(playerLp ?? 0),
            rate: result.iskPerLp === null ? '—' : formatIskPerLp(result.iskPerLp),
          }}
          components={{
            income: <IskAmount value={result.totals.income} decimals={0} />,
            profit: <IskAmount value={result.totals.profit} decimals={0} />,
            purchases: <IskAmount value={result.totals.purchases} decimals={0} />,
          }}
        />
      </p>
      <DataTable
        label={t('loyaltyStore.spendPlan.title')}
        columns={columns}
        rows={planRows}
        rowKey={(r) => r.offerId}
        onRowClick={(r) => onSelectOffer(r.row)}
        density="compact"
      />
      <div className="flex flex-col gap-0.5 border-t border-line px-3 py-1.5">
        <StopLine stop={result.stop} view={view} />
        <p className={noteClassName}>
          {t('loyaltyStore.spendPlan.lpLeft', { lp: formatCount(result.lpLeft) })}
        </p>
        {view.walletBalance === null && (
          <p className={noteClassName}>{t('loyaltyStore.spendPlan.walletUnknown')}</p>
        )}
        {result.unpriced.length > 0 && (
          <p className={noteClassName}>
            {t('loyaltyStore.spendPlan.unpriced', { count: result.unpriced.length })}
          </p>
        )}
      </div>
    </div>
  );
}

export function SpendPlanPanel({
  plan,
  playerLp,
  onSelectOffer,
  onClose,
}: {
  plan: AsyncLoad<SpendPlanView>;
  playerLp: number | null;
  onSelectOffer: (row: LoyaltyOfferRow) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Panel
      title={t('loyaltyStore.spendPlan.title')}
      meta={t('loyaltyStore.spendPlan.meta')}
      wrapMeta
      padded={false}
      actions={
        <IconButton
          icon={<Icon.Close />}
          label={t('loyaltyStore.spendPlan.close')}
          size="sm"
          onClick={onClose}
        />
      }
    >
      {plan.status === 'ready' ? (
        <PlanBody view={plan.data} playerLp={playerLp} onSelectOffer={onSelectOffer} />
      ) : plan.status === 'failed' ? (
        <LoadFailedState onRetry={plan.retry} />
      ) : (
        <p className={`px-3 py-2 ${noteClassName}`}>{t('loyaltyStore.walkedLoading')}</p>
      )}
    </Panel>
  );
}
