import type { PiData } from '@/sde/types';

export { eveClock } from '@/lib/eveTime';

export function hoursLabel(hours: number): string {
  const total = Math.max(0, Math.round(hours));
  if (total < 48) return `${total} h`;
  const days = Math.floor(total / 24);
  const rest = total % 24;
  return rest === 0 ? `${days} d` : `${days} d ${rest} h`;
}

const outputBySchematic = new WeakMap<PiData, Map<number, number>>();

export function schematicOutputTypeId(schematicId: number, pi: PiData): number | null {
  let index = outputBySchematic.get(pi);
  if (!index) {
    index = new Map(
      Object.entries(pi.schematics).map(([typeId, schematic]) => [
        schematic.schematicId,
        Number(typeId),
      ])
    );
    outputBySchematic.set(pi, index);
  }
  return index.get(schematicId) ?? null;
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/);
  return (words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2)).toUpperCase();
}
