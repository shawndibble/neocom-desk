/**
 * One severity vocabulary for the whole Calendar page.
 *
 * The map's dots, the ticker's bars and the rail's countdowns are three
 * renderings of the same four-value ladder, and three private copies of the
 * mapping is how one of them quietly ends up a shade off the others. The corp
 * board keeps its own copy in `CorpDeadlineStrip`/`CorpBoardRow`; unifying
 * across that seam is a wider change than this one, and is noted rather than
 * done here.
 *
 * `SEVERITY_LABEL` reads the corp namespace deliberately — the four words are
 * the same four words, and a second set of English strings saying "Critical"
 * would be a translation to keep in step for no gain.
 */
import type { DeadlineSeverity } from '@/engine/severity';

/** Dot and bar fills — flat, per DESIGN.md §6. */
export const SEVERITY_DOT: Record<DeadlineSeverity, string> = {
  critical: 'bg-danger',
  warning: 'bg-warning',
  watch: 'bg-accent',
  clear: 'bg-text-dim',
};

/** Text tone for a countdown. */
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
