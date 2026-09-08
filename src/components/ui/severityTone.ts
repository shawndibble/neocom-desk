/**
 * Severity to tokens: fill, text tone, icon and the word for it.
 *
 * The corp ops board renders this four-value ladder as rows and as a strip,
 * and each had grown its own copy of these maps. Several `Record` literals
 * over four keys is how one of them quietly ends up a shade off the others, or
 * keeps a tone the palette has since dropped.
 *
 * **This is a magnitude scale, and only corp paints it now.** The character's
 * Coming Up rail used to as well; its colour names the *kind* of clock instead
 * (`kindTone.ts`), because on a list that is already ordered by deadline and
 * carries a countdown on every row, a severity tone was the third telling of
 * one fact and the first telling of none. Keep the two apart: an ordinal scale
 * and a nominal one are not interchangeable, however similar these maps look.
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
