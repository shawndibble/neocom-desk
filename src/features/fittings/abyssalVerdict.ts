import type { AbyssalActivation, AbyssalHullRule } from '@/engine/fittings/abyssalRun';

/** i18n keys under `fittings.abyssalRun.verdict`. */
export interface AbyssalVerdict {
  /** Nothing is wrong: the line leads with "Clear to run". */
  clear: boolean;
  /** What is fine, in plain tone: the hull's class and the missing flag. */
  facts: string[];
  /** What is wrong, each in warning tone with its own cause wording. */
  problems: string[];
}

/**
 * The hull rule and the activation rule read as one verdict. Rules are
 * untouched: this only sorts their outcomes into "fine" and "wrong".
 * `hullKnown` is false while the catalogue has not said what the hull is.
 */
export function abyssalVerdict(
  hull: AbyssalHullRule,
  activation: AbyssalActivation,
  hullKnown: boolean
): AbyssalVerdict {
  const facts: string[] = [];
  const problems: string[] = [];
  if (hullKnown) {
    if (hull.eligible) {
      facts.push(`hull.${hull.shipClass}`);
      if (!hull.confirmed) problems.push('hull.unconfirmed');
    } else problems.push(`hull.${hull.reason}`);
  }
  if (activation === 'clear') facts.push('activation.clear');
  else problems.push(`activation.${activation}`);
  return { clear: problems.length === 0, facts, problems };
}
