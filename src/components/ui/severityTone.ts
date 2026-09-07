/**
 * Severity to tokens: fill, text tone, icon and the word for it.
 *
 * Both deadline boards render the same four-value ladder — the corp ops board
 * as rows and a strip, the character's Coming Up rail as rows, a map and a
 * ticker — and each had grown its own copy of these maps. Nine `Record`
 * literals over four keys is how one of them quietly ends up a shade off the
 * others, or keeps a tone the palette has since dropped.
 *
 * The i18n keys stay in the `corp.board.severity.*` namespace they were born
 * in: the four words are the same four words, and a second set of English
 * strings saying "Critical" would be a translation to keep in step for nothing.
 */
import type { DeadlineSeverity } from '@/engine/severity';
import * as Icon from './icons';

/** Background fill — flat, per DESIGN.md §6. Dots, bars, swatches. */
export const SEVERITY_FILL: Record<DeadlineSeverity, string> = {
  critical: 'bg-danger',
  warning: 'bg-warning',
  watch: 'bg-accent',
  clear: 'bg-text-dim',
};

/** Text tone for a countdown or a figure. */
export const SEVERITY_TEXT: Record<DeadlineSeverity, string> = {
  critical: 'text-danger',
  warning: 'text-warning',
  watch: 'text-accent',
  clear: 'text-text-dim',
};

/** The word for the tone — DESIGN.md §7: colour is never the only signal. */
export const SEVERITY_LABEL: Record<DeadlineSeverity, string> = {
  critical: 'corp.board.severity.critical',
  warning: 'corp.board.severity.warning',
  watch: 'corp.board.severity.watch',
  clear: 'corp.board.severity.clear',
};

/** The glyph a row leads with. */
export const SEVERITY_ICON: Record<DeadlineSeverity, typeof Icon.Warn> = {
  critical: Icon.SeverityCritical,
  warning: Icon.Warn,
  watch: Icon.SeverityWatch,
  clear: Icon.SeverityClear,
};
