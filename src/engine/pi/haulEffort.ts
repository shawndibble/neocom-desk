import type { PiData } from '@/sde/types';
import type { FlowEnd, HaulEffort, JumpsFn } from './goalTypes';
import { rawById } from './rawIndex';

export function volumeOf(typeId: number, pi: PiData): number {
  const schematic = pi.schematics[String(typeId)];
  if (schematic) return schematic.volume;
  const raw = rawById(pi).get(typeId);
  if (!raw) throw new Error(`${typeId} is not a planetary commodity`);
  return raw.volume;
}

export function legJumps(from: FlowEnd, to: FlowEnd, jumps: JumpsFn | undefined): number | null {
  if (from === to) return 0;
  if (!jumps) return null;
  if (from === 'hub') return to === 'hub' ? 0 : jumps(to, 'hub');
  return jumps(from, to);
}

export function haulEffortOf(
  legs: readonly { from: FlowEnd; to: FlowEnd; typeId: number; unitsPerHour: number }[],
  pi: PiData,
  jumps: JumpsFn | undefined
): HaulEffort {
  let m3JumpsPerHour = 0;
  let unknownLegs = 0;
  for (const leg of legs) {
    if (leg.from === leg.to || leg.unitsPerHour <= 0) continue;
    const count = legJumps(leg.from, leg.to, jumps);
    if (count === null) unknownLegs += 1;
    else m3JumpsPerHour += leg.unitsPerHour * volumeOf(leg.typeId, pi) * count;
  }
  return { m3JumpsPerHour, unknownLegs };
}
