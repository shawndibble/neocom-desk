/**
 * How the four-rung ladder (`engine/severity.ts`) is drawn: a text tone, a
 * glyph, and the key that names the rung.
 *
 * **One table, not three parallel ones.** DESIGN.md §6/§7 are explicit that
 * colour is never the sole signal, so a caller reaching for the tone alone
 * would ship a row a colorblind reader cannot rank. Three `Record`s keyed the
 * same way make that exactly as easy as doing it right; one entry per rung
 * makes the glyph impossible to miss, and adding a fifth rung a single edit.
 *
 * Values, not a component, and in their own module: `SeverityIcon.tsx` exports
 * a component, and a value export beside it defeats fast refresh (the same
 * reason `orderBadgeKind.ts` sits apart from `OrderProblemBadge.tsx`).
 */
import type { BoardSeverity } from '@/engine/severity';
import * as Icon from './icons';

export interface SeverityStyle {
  /** `clear` takes the dim text colour rather than `success` — a structure with a month of fuel is not an achievement, it is simply not today's problem. */
  tone: string;
  /** `warning` reuses the app's existing `Warn` triangle rather than inventing a fifth glyph. */
  glyph: typeof Icon.Warn;
  /** Names the rung, for the sr-only label that ranks a row for assistive tech. */
  labelKey: string;
}

export const SEVERITY_STYLE: Record<BoardSeverity, SeverityStyle> = {
  critical: {
    tone: 'text-danger',
    glyph: Icon.SeverityCritical,
    labelKey: 'severity.critical',
  },
  warning: { tone: 'text-warning', glyph: Icon.Warn, labelKey: 'severity.warning' },
  watch: { tone: 'text-accent', glyph: Icon.SeverityWatch, labelKey: 'severity.watch' },
  clear: { tone: 'text-text-dim', glyph: Icon.SeverityClear, labelKey: 'severity.clear' },
};
