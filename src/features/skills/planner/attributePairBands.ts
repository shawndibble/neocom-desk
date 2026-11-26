import type { AttributeName, EngineSkill } from '@/engine/types';
import type { PlanRow } from './markers';

export interface AttributePair {
  primary: AttributeName;
  secondary: AttributeName;
}

function pairKey(pair: AttributePair): string {
  return `${pair.primary}/${pair.secondary}`;
}

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
