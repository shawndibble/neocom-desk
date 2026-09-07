/**
 * How the four-rung ladder (`engine/severity.ts`) is drawn: a text tone and a
 * glyph, per rung.
 *
 * Both are needed together, always. DESIGN.md §6/§7 are explicit that colour
 * is never the sole signal, so a caller reaching for the tone alone would ship
 * a row a colorblind reader cannot rank. Keeping the pair in one table is what
 * makes that hard to do by accident.
 *
 * Values, not a component, and in their own module: `SeverityIcon.tsx` exports
 * a component, and a value export beside it defeats fast refresh (the same
 * reason `orderBadgeKind.ts` sits apart from `OrderProblemBadge.tsx`).
 */
import type { BoardSeverity } from '@/engine/severity';
import * as Icon from './icons';

/**
 * `clear` takes the dim text colour rather than `success` — a structure with a
 * month of fuel is not an achievement, it is simply not today's problem.
 */
export const SEVERITY_TONE: Record<BoardSeverity, string> = {
  critical: 'text-danger',
  warning: 'text-warning',
  watch: 'text-accent',
  clear: 'text-text-dim',
};

/**
 * `warning` reuses the app's existing `Warn` triangle rather than inventing a
 * fifth glyph.
 */
export const SEVERITY_GLYPH: Record<BoardSeverity, typeof Icon.Warn> = {
  critical: Icon.SeverityCritical,
  warning: Icon.Warn,
  watch: Icon.SeverityWatch,
  clear: Icon.SeverityClear,
};

/** i18n key naming a rung, for the sr-only label that ranks the row for assistive tech. */
export const SEVERITY_LABEL_KEY: Record<BoardSeverity, string> = {
  critical: 'corp.board.severity.critical',
  warning: 'corp.board.severity.warning',
  watch: 'corp.board.severity.watch',
  clear: 'corp.board.severity.clear',
};
