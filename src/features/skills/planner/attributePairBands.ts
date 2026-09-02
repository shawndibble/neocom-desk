/**
 * Attribute-pair band headers for the entry list (#115): an alternative to
 * bands.ts's priority grouping — same mechanic, but a new band starts where
 * the primary/secondary attribute pair changes instead of priority. Purely
 * presentational, like bands.ts: the plan's actual order (and drag-and-drop)
 * is untouched.
 */
import type { AttributeName, EngineSkill } from '@/engine/types';
import type { PlanRow } from './markers';

export interface AttributePair {
  primary: AttributeName;
  secondary: AttributeName;
}

function pairKey(pair: AttributePair): string {
  return `${pair.primary}/${pair.secondary}`;
}

/**
 * Row ids that start a new attribute-pair band, mapped to that band's pair.
 * Marker rows are skipped entirely, like bandStarts. An entry whose skill is
 * unknown to the catalog is skipped the same way — there's no pair to show,
 * so it neither starts a band nor resets the running comparison.
 */
export function attributePairBandStarts(
  rows: readonly PlanRow[],
  skills: ReadonlyMap<number, EngineSkill>
): Map<string, AttributePair> {
  const starts = new Map<string, AttributePair>();
  let previous: string | undefined;
  for (const row of rows) {
    if (row.kind !== 'entry') continue;
    const skill = skills.get(row.entry.skillTypeID);
    if (!skill) continue;
    const pair: AttributePair = { primary: skill.primary, secondary: skill.secondary };
    const key = pairKey(pair);
    if (key !== previous) starts.set(row.id, pair);
    previous = key;
  }
  return starts;
}
