import type { PiData } from '@/sde/types';

export { eveClock } from '@/lib/eveTime';

/** 16 h, 2 d 4 h: hours under two days, then days and hours. */
export function hoursLabel(hours: number): string {
  const total = Math.max(0, Math.round(hours));
  if (total < 48) return `${total} h`;
  const days = Math.floor(total / 24);
  const rest = total % 24;
  return rest === 0 ? `${days} d` : `${days} d ${rest} h`;
}

const outputBySchematic = new WeakMap<PiData, Map<number, number>>();

/** The typeID a schematic produces; `pi.schematics` is keyed by it. */
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

/** Two-letter badge for a character: "Vela Arrano" is "VA". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/);
  return (words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2)).toUpperCase();
}
