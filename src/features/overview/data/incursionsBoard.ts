/**
 * The Overview's Incursions card (issue #3541): the nearest Incursions from
 * the pilot's Current System, read through Route Safety's own loader and jump
 * basis (#3540) — see `IncursionsBoardSource` for the reads. Off by default
 * (`widgets/migrate.ts`).
 *
 * Conditions, never verdicts, as on Route Safety: a row says where, what
 * state and how far, never whether it is worth flying to.
 */
import type { DeadlineSeverity } from '@/engine/character/severity';
import type { IncursionRow } from '@/engine/incursions/incursionRows';
import type { JumpDistanceStatus } from '@/features/route/currentSystem';
import type { Translate } from '@/lib/translate';

export interface IncursionsBoardData {
  /** `failed`: the feed could not be read and nothing was cached — not "no incursions". */
  status: 'loading' | 'failed' | 'ready';
  /** Nearest first (`buildIncursionRows`). */
  rows: readonly IncursionRow[];
  /** Why a row has no distance: no Current System, an unread graph, or still counting. */
  jumpsStatus: JumpDistanceStatus;
  systemNames: ReadonlyMap<number, string>;
  constellationNames: ReadonlyMap<number, string>;
}

/** What a row prints instead of a figure it does not have — never a zero. */
const NO_FIGURE = '—';

/** A row's clock column: the jump count, "No route", or nothing to count from. */
export function incursionJumpsWhen(
  t: Translate,
  row: IncursionRow,
  jumpsStatus: JumpDistanceStatus
): string {
  if (row.jumps !== null) return t('overview.board.incursionsJumps', { count: row.jumps });
  if (jumpsStatus === 'ready') return t('overview.board.incursionsNoRoute');
  // The card's body says why (no Current System, or the graph is unread).
  return NO_FIGURE;
}

/** The folded phone line. */
export function incursionsSummary(t: Translate, data: IncursionsBoardData | null): string {
  if (data === null || data.status === 'loading') return t('overview.board.checking');
  if (data.status === 'failed') return t('overview.board.incursionsFailed');
  const nearest = data.rows[0];
  if (nearest === undefined) return t('overview.board.incursionsNone');
  if (nearest.jumps === null) {
    // Say why there is no distance, as the card does, rather than leave it out.
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

/**
 * Never above clear: nothing about a nearby Incursion is the pilot's to act
 * on. `clear` is the board's neutral tone here, the one a `TriageRow` must
 * carry, not a verdict on the site.
 */
export function incursionsSeverity(data: IncursionsBoardData | null): DeadlineSeverity | null {
  return data?.status === 'ready' ? 'clear' : null;
}
