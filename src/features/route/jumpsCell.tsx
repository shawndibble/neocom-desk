/**
 * A table's own "distance from me" column cell, for every table built off
 * `useJumpRangeFilter`'s `jumps`/`jumpsStatus` (Market Browser, Contract
 * Search's Items board, BPC Search). Split out of `JumpRangeControls.tsx`
 * (which exports only components, for Fast Refresh) since this is a plain
 * render function, not a component.
 */
import type { TFunction } from 'i18next';
import type { ReactNode } from 'react';
import type { JumpsCellValue } from './currentSystem';

/**
 * Pending, no origin to measure from, the local stargate snapshot unreadable,
 * or a settled count — `null` for a row this app cannot place on the graph,
 * which each table explains with its own `unavailableHintKey` (a market
 * order's system is always known; an offer's or a blueprint's location can
 * be a player structure the graph doesn't reach either).
 */
export function renderJumpsCell(
  cell: JumpsCellValue,
  t: TFunction,
  unavailableHintKey: string
): ReactNode {
  if (cell.kind === 'loading') return <span className="text-text-dim">…</span>;
  if (cell.kind === 'no-origin') {
    return (
      <span className="text-text-dim" title={t('jumpRange.noOrigin')}>
        —
      </span>
    );
  }
  if (cell.kind === 'unknown') {
    return (
      <span className="text-text-dim" title={t('jumpRange.distanceUnavailable')}>
        —
      </span>
    );
  }
  if (cell.count === null) {
    return (
      <span className="text-text-dim" title={t(unavailableHintKey)}>
        —
      </span>
    );
  }
  return String(cell.count);
}
