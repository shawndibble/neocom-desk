import type { PlanetType } from '@/esi/endpoints';
import type { PiData } from '@/sde/types';

/** The planet render the image server holds for each type (their SDE type ids). */
export const PLANET_TYPE_ID: Record<PlanetType, number> = {
  temperate: 11,
  ice: 12,
  gas: 13,
  oceanic: 2014,
  lava: 2015,
  barren: 2016,
  storm: 2017,
  plasma: 2063,
};

const EVE_CLOCK = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'UTC',
});

/** "Wed 02:00": EVE time is UTC, and a pilot plans a login against it, not their own zone. */
export function eveClock(ms: number): string {
  return EVE_CLOCK.format(new Date(ms)).replace(',', '');
}

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
