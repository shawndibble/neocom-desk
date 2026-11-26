import type { ShipTreeGroup } from '@/sde/types';
import raw from './classData.json';

interface RawFaction {
  name: string;
  hullCounts: Record<string, number>;
  prereqs: Record<string, [number, number, number][]>;
}

const data = raw as unknown as {
  classNames: Record<string, string>;
  skills: Record<string, { name: string; alphaMaxLevel: number }>;
  factions: Record<string, RawFaction>;
};

export const FACTION_IDS: number[] = Object.keys(data.factions).map(Number);

export function hullCounts(factionID: number): Map<number, number> {
  const f = data.factions[String(factionID)];
  return new Map(Object.entries(f?.hullCounts ?? {}).map(([id, n]) => [Number(id), n]));
}

export const GROUPS: ReadonlyMap<number, ShipTreeGroup> = (() => {
  const groups = new Map<number, ShipTreeGroup>();
  for (const [id, name] of Object.entries(data.classNames)) {
    groups.set(Number(id), {
      id: Number(id),
      name,
      description: '',
      icon: '',
      prereqsByFaction: {},
    });
  }
  for (const [factionID, f] of Object.entries(data.factions)) {
    for (const [classId, list] of Object.entries(f.prereqs)) {
      const group = groups.get(Number(classId));
      if (!group) continue;
      group.prereqsByFaction[factionID] = list.map(([skillTypeID, level, display]) => ({
        skillTypeID,
        level,
        display: display === 1,
      }));
    }
  }
  return groups;
})();

export const alphaMaxLevel = (skillTypeID: number): number =>
  data.skills[String(skillTypeID)]?.alphaMaxLevel ?? 0;

export const skillName = (skillTypeID: number): string | undefined =>
  data.skills[String(skillTypeID)]?.name;
