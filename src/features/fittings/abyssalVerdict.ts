import type { AbyssalActivation, AbyssalHullRule } from '@/engine/fittings/abyssalRun';

export interface AbyssalVerdict {
  clear: boolean;
  facts: string[];
  problems: string[];
}

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
