import type { SkillGateVerdict } from '@/engine/industry/skillGate';

export function gateKey(verdict: SkillGateVerdict | undefined): string | null {
  if (!verdict?.gated) return null;
  return verdict.shortfall
    .map((skill) => `${skill.typeID}:${skill.needLevel}`)
    .sort()
    .join(',');
}

const COMMON_GATE_MIN_ROWS = 3;

export function commonGateKey(verdicts: ReadonlyMap<number, SkillGateVerdict>): string | null {
  const counts = new Map<string, number>();
  let gated = 0;
  for (const verdict of verdicts.values()) {
    const key = gateKey(verdict);
    if (key === null) continue;
    gated += 1;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [key, count] of counts) {
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  return bestCount >= COMMON_GATE_MIN_ROWS && bestCount * 2 > gated ? best : null;
}
