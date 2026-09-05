/**
 * Resizable bottom drawer for the Compare Set (CONTEXT.md, round 8): a
 * persistent `Compare (N)` handle, opening a drawer beside the order book
 * rather than covering it — comparing happens *while* browsing, so this is a
 * non-modal overlay, never `Modal`/`<dialog>` (that would inert the order
 * book the user is cross-referencing).
 */
import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, DataTable, IconButton, Spinner } from '@/components/ui';
import type { DataTableColumn } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { useCompareSet } from './compareSet';
import { useCompareRows, type CompareRow } from './useCompareRows';
import type { LocationMode } from './locationMode';
import type { GlobalMarketOverride } from '@/engine/market/locationMode';
import { compareCsvColumns } from './compareCsv';
import { formatVolume } from './format';
import { downloadCsv } from '@/lib/downloadCsv';
import { formatIsk } from '@/lib/isk';

const DRAWER_ID = 'compare-drawer';
const MIN_HEIGHT = 160;
const MAX_HEIGHT = 560;
const DEFAULT_HEIGHT = 280;
const FULL_HEIGHT = '80vh';
const STEP = 24;

function clampHeight(value: number): number {
  return Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, value));
}

export interface CompareDrawerProps {
  chosenRegionId: number;
  globalMarkets: ReadonlyMap<number, GlobalMarketOverride>;
  locationMode: LocationMode;
  hubStationId: number;
  refreshTick: number;
}

/** Mounted only while the Compare Set is non-empty — see Market.tsx. Unmounting on empty resets the drawer's own open/height state for free. */
export function CompareDrawer({
  chosenRegionId,
  globalMarkets,
  locationMode,
  hubStationId,
  refreshTick,
}: CompareDrawerProps) {
  const { t } = useTranslation();
  const items = useCompareSet((state) => state.items);
  const removeItem = useCompareSet((state) => state.remove);
  const clearSet = useCompareSet((state) => state.clear);

  const [mode, setMode] = useState<'closed' | 'open' | 'full'>('closed');
  const [heightPx, setHeightPx] = useState(DEFAULT_HEIGHT);
  const handleRef = useRef<HTMLButtonElement>(null);
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);

  const rows = useCompareRows({
    items,
    enabled: mode !== 'closed',
    chosenRegionId,
    globalMarkets,
    locationMode,
    hubStationId,
    refreshTick,
  });

  function close() {
    setMode('closed');
    handleRef.current?.focus();
  }

  function startDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (mode !== 'open') return;
    dragRef.current = { startY: event.clientY, startHeight: heightPx };
    function onMove(moveEvent: PointerEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      setHeightPx(clampHeight(drag.startHeight + (drag.startY - moveEvent.clientY)));
    }
    function onUp() {
      dragRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function onHandleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (mode !== 'open') return;
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHeightPx((h) => clampHeight(h + STEP));
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHeightPx((h) => clampHeight(h - STEP));
    }
  }

  const columns = useMemo<DataTableColumn<CompareRow>[]>(
    () => [
      {
        id: 'item',
        header: t('market.compare.columnItem'),
        render: (row) => row.itemName,
      },
      {
        id: 'bestSell',
        header: t('market.compare.columnBestSell'),
        align: 'right',
        className: 'tabular-nums',
        render: (row) =>
          row.loading
            ? '…'
            : row.summary?.bestSell != null
              ? formatIsk(row.summary.bestSell, 2)
              : '—',
        sortValue: (row) => row.summary?.bestSell ?? undefined,
      },
      {
        id: 'bestBuy',
        header: t('market.compare.columnBestBuy'),
        align: 'right',
        className: 'tabular-nums',
        render: (row) =>
          row.loading
            ? '…'
            : row.summary?.bestBuy != null
              ? formatIsk(row.summary.bestBuy, 2)
              : '—',
        sortValue: (row) => row.summary?.bestBuy ?? undefined,
      },
      {
        id: 'spread',
        header: t('market.compare.columnSpread'),
        align: 'right',
        className: 'tabular-nums',
        render: (row) =>
          row.loading ? '…' : row.summary?.spread != null ? formatIsk(row.summary.spread, 2) : '—',
        sortValue: (row) => row.summary?.spread ?? undefined,
      },
      {
        id: 'volume',
        header: t('market.compare.columnVolume'),
        align: 'right',
        className: 'tabular-nums',
        render: (row) => (row.loading ? '…' : formatVolume(row.summary?.availableVolume ?? 0)),
        sortValue: (row) => row.summary?.availableVolume ?? undefined,
      },
      {
        id: 'remove',
        header: '',
        align: 'right',
        render: (row) => (
          <Button size="sm" onClick={() => removeItem(row.typeId)}>
            {t('market.compare.remove', { name: row.itemName })}
          </Button>
        ),
      },
    ],
    [t, removeItem]
  );

  return (
    // Fixed-position overlay, not page flow, so `Panel` (DESIGN.md §4) doesn't
    // fit; a plain bordered surface matches its look without the component.
    // `flex-col-reverse` with the handle as the *first* DOM child (below)
    // keeps it visually below the drawer while keeping it before the drawer's
    // content in tab order, so Tab from the handle enters the drawer next.
    <div className="fixed inset-x-0 bottom-16 z-30 flex flex-col-reverse items-stretch md:bottom-0">
      <button
        ref={handleRef}
        type="button"
        aria-expanded={mode !== 'closed'}
        aria-controls={DRAWER_ID}
        onClick={() => setMode((m) => (m === 'closed' ? 'open' : 'closed'))}
        className="flex h-9 items-center justify-center border border-line bg-panel px-4 text-[0.6875rem] font-semibold tracking-widest text-text uppercase hover:bg-panel-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
      >
        {t('market.compare.handle', { count: items.length })}
      </button>
      {mode !== 'closed' && (
        <section
          id={DRAWER_ID}
          aria-label={t('market.compare.title')}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              close();
            }
          }}
          style={{ height: mode === 'full' ? FULL_HEIGHT : heightPx }}
          className="flex flex-col border border-b-0 border-line bg-panel"
        >
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label={t('market.compare.resize')}
            aria-valuenow={mode === 'open' ? heightPx : undefined}
            aria-valuemin={MIN_HEIGHT}
            aria-valuemax={MAX_HEIGHT}
            tabIndex={mode === 'open' ? 0 : -1}
            onPointerDown={startDrag}
            onKeyDown={onHandleKeyDown}
            className={`h-1.5 shrink-0 border-b border-line ${mode === 'open' ? 'cursor-row-resize hover:bg-panel-2' : ''}`}
          />
          <header className="flex min-h-8 items-center justify-between gap-2 border-b border-line px-3 py-1">
            <h2 className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
              {t('market.compare.handle', { count: items.length })}
            </h2>
            <div className="flex items-center gap-2">
              <IconButton
                size="sm"
                icon={<Icon.Download />}
                label={t('market.compare.exportCsv')}
                disabled={rows.length === 0}
                onClick={() => downloadCsv('market-compare', rows, compareCsvColumns(t))}
              />
              <Button size="sm" onClick={() => setMode((m) => (m === 'full' ? 'open' : 'full'))}>
                {mode === 'full' ? t('market.compare.restore') : t('market.compare.expand')}
              </Button>
              <Button size="sm" onClick={clearSet}>
                {t('market.compare.clearAll')}
              </Button>
              <button
                type="button"
                onClick={close}
                aria-label={t('common.close')}
                className="rounded-xs px-1.5 py-0.5 text-text-dim transition-colors hover:bg-panel-2 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {rows.length === 0 ? (
              <div className="flex justify-center py-8">
                <Spinner label={t('common.loading')} />
              </div>
            ) : (
              <DataTable
                columns={columns}
                rows={rows}
                rowKey={(row) => row.typeId}
                label={t('market.compare.title')}
              />
            )}
          </div>
        </section>
      )}
    </div>
  );
}
