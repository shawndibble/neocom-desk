import type { DeadlineSeverity } from '@/engine/character/severity';
import type { IncursionRow } from '@/engine/incursions/incursionRows';
import type { JumpDistanceStatus } from '@/features/route/currentSystem';
import type { Translate } from '@/lib/translate';

export interface IncursionsBoardData {
  status: 'loading' | 'failed' | 'ready';
  rows: readonly IncursionRow[];
  jumpsStatus: JumpDistanceStatus;
  systemNames: ReadonlyMap<number, string>;
  constellationNames: ReadonlyMap<number, string>;
}

const NO_FIGURE = '—';

export function incursionJumpsWhen(
  t: Translate,
  row: IncursionRow,
  jumpsStatus: JumpDistanceStatus
): string {
  if (row.jumps !== null) return t('overview.board.incursionsJumps', { count: row.jumps });
  if (jumpsStatus === 'ready') return t('overview.board.incursionsNoRoute');
  return NO_FIGURE;
}

export function incursionsSummary(t: Translate, data: IncursionsBoardData | null): string {
  if (data === null || data.status === 'loading') return t('overview.board.checking');
  if (data.status === 'failed') return t('overview.board.incursionsFailed');
  const nearest = data.rows[0];
  if (nearest === undefined) return t('overview.board.incursionsNone');
  if (nearest.jumps === null) {
    if (data.jumpsStatus === 'no-origin') {
      return t('overview.board.incursionsNoOrigin', { count: data.rows.length });
    }
    return t('overview.board.incursionsActive', { count: data.rows.length });
  }
  return t('overview.board.incursionsNearest', {
    count: data.rows.length,
    system:
      data.systemNames.get(nearest.stagingSystemId) ??
      t('travel.stops.unnamed', { id: nearest.stagingSystemId }),
    jumps: incursionJumpsWhen(t, nearest, data.jumpsStatus),
  });
}

export function incursionsSeverity(data: IncursionsBoardData | null): DeadlineSeverity | null {
  return data?.status === 'ready' ? 'clear' : null;
}
