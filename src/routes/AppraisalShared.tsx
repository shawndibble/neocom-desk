import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  buttonClassName,
  DataTable,
  EmptyState,
  LogoMark,
  Spinner,
  StatChip,
  type DataTableColumn,
} from '@/components/ui';
import type { AppraisalRow } from '@/engine/market/appraisal';
import { formatVolume } from '@/features/market/format';
import {
  resolveAppraisalShare,
  type AppraisalShareView,
} from '@/features/market/appraisalShareData';
import { formatIsk, formatIskAuto } from '@/lib/isk';

/** A missing price is a dash, never a zero — same house placeholder as `AppraisalPanel`. */
function iskCell(value: number | null, decimals: 'auto' | 0): string {
  if (value === null) return '—';
  return decimals === 'auto' ? formatIskAuto(value) : formatIsk(value);
}

type LoadState =
  | { status: 'loading' }
  | { status: 'invalid' }
  | { status: 'failed' }
  | { status: 'ready'; view: AppraisalShareView };

/**
 * The read-only view a Share link (#831) opens. Outside `RequireCharacter`
 * and `ScopeGate` deliberately — this is the app's first real unauthenticated
 * *content* route (`routeScopes.test.ts` asserts the exemption) — so no
 * navigation chrome renders here, only a link back to the live app.
 *
 * The `d` query param is a `typeId:quantity` payload, never priced numbers;
 * `resolveAppraisalShare` re-runs the same appraisal engine the live tab
 * uses, at view time, so pricing here is exactly as current as opening the
 * live tab would be.
 */
export function AppraisalShared() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const payload = searchParams.get('d') ?? '';
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    // An empty payload needs no async work — handled below, outside the
    // effect, rather than by calling setState synchronously in here.
    if (payload === '') return;
    let cancelled = false;
    void (async () => {
      setLoadState({ status: 'loading' });
      try {
        const result = await resolveAppraisalShare(payload);
        if (cancelled) return;
        setLoadState(result.ok ? { status: 'ready', view: result.value } : { status: 'invalid' });
      } catch {
        if (!cancelled) setLoadState({ status: 'failed' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [payload]);

  const state: LoadState = payload === '' ? { status: 'invalid' } : loadState;

  const columns: DataTableColumn<AppraisalRow>[] = [
    {
      id: 'quantity',
      header: t('market.appraisal.columnQuantity'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      render: (row) => formatVolume(row.quantity),
      sortValue: (row) => row.quantity,
    },
    {
      id: 'item',
      header: t('market.appraisal.columnItem'),
      primary: true,
      render: (row) => row.name,
      sortValue: (row) => row.name,
    },
    {
      id: 'buyEach',
      header: t('market.appraisal.columnBuyEach'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums text-text-dim',
      render: (row) => iskCell(row.buyEach, 'auto'),
      sortValue: (row) => row.buyEach ?? undefined,
    },
    {
      id: 'sellEach',
      header: t('market.appraisal.columnSellEach'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums text-text-dim',
      render: (row) => iskCell(row.sellEach, 'auto'),
      sortValue: (row) => row.sellEach ?? undefined,
    },
    {
      id: 'buyTotal',
      header: t('market.appraisal.columnBuyTotal'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      render: (row) => iskCell(row.buyTotal, 0),
      sortValue: (row) => row.buyTotal ?? undefined,
    },
    {
      id: 'sellTotal',
      header: t('market.appraisal.columnSellTotal'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      render: (row) => iskCell(row.sellTotal, 0),
      sortValue: (row) => row.sellTotal ?? undefined,
    },
  ];

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 bg-bg p-6 text-text">
      <div className="flex items-center gap-2">
        <LogoMark className="size-6" />
        <h1 className="text-sm font-semibold tracking-widest uppercase">
          {t('appraisalShare.title')}
        </h1>
      </div>

      <p className="rounded-xs border border-warning bg-panel-2 px-3 py-2 text-xs text-warning">
        {t('appraisalShare.banner')}
      </p>

      {state.status === 'loading' && (
        <div className="flex justify-center py-10">
          <Spinner label={t('common.loading')} />
        </div>
      )}

      {state.status === 'invalid' && (
        <EmptyState
          title={t('appraisalShare.invalidTitle')}
          hint={t('appraisalShare.invalidHint')}
          className="py-10"
        />
      )}

      {state.status === 'failed' && (
        <EmptyState
          title={t('market.loadFailedTitle')}
          hint={t('market.loadFailedHint')}
          className="py-10"
        />
      )}

      {state.status === 'ready' && (
        <>
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-1 py-2">
            <StatChip
              label={state.view.hub.systemName}
              value={t('market.appraisal.atPercent', { pricePercent: state.view.pricePercent })}
            />
            <StatChip
              label={t('market.appraisal.sellTotal')}
              value={formatIsk(state.view.appraisal.totals.sell)}
              tone="accent"
            />
            <StatChip
              label={t('market.appraisal.buyTotal')}
              value={formatIsk(state.view.appraisal.totals.buy)}
            />
            <StatChip
              label={t('appraisalShare.generatedLabel')}
              value={new Date(state.view.generatedAt * 1000).toLocaleString()}
            />
          </div>

          {state.view.unresolvedTypeIds.length > 0 && (
            <div className="rounded-xs border border-line bg-panel-2 px-2.5 py-2">
              <p className="text-[0.6875rem] font-semibold tracking-widest text-warning uppercase">
                {t('appraisalShare.unresolved', { count: state.view.unresolvedTypeIds.length })}
              </p>
              <ul className="pt-1">
                {state.view.unresolvedTypeIds.map((typeId) => (
                  <li key={typeId} className="font-mono text-[0.6875rem] text-text-dim">
                    {t('appraisalShare.unresolvedTypeId', { typeId })}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {state.view.appraisal.rows.length === 0 ? (
            <EmptyState
              title={t('market.appraisal.noMatchesTitle')}
              hint={t('market.appraisal.noMatchesHint')}
              className="py-10"
            />
          ) : (
            <DataTable
              columns={columns}
              rows={state.view.appraisal.rows}
              rowKey={(row) => row.typeId}
              label={t('appraisalShare.title')}
            />
          )}
        </>
      )}

      <Link to="/" className={buttonClassName({ size: 'sm' })}>
        {t('appraisalShare.backToApp')}
      </Link>
    </main>
  );
}
