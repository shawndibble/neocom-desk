import type { ShipTreeClassSkill, ShipTreeGroup } from '@/sde/types';
import {
  AMARR_FACTION_ID,
  CALDARI_FACTION_ID,
  EMPIRE_FACTION_IDS,
  GALLENTE_FACTION_ID,
  MINMATAR_FACTION_ID,
  ORE_FACTION_ID,
} from './templates';
import type { ShipTreeHullStatus, ShipTreeTileTone } from './types';

const EMPIRE_BY_PREFIX: Readonly<Record<string, number>> = {
  Caldari: CALDARI_FACTION_ID,
  Minmatar: MINMATAR_FACTION_ID,
  Amarr: AMARR_FACTION_ID,
  Gallente: GALLENTE_FACTION_ID,
};

const prereqs = (
  group: ShipTreeGroup | undefined,
  factionID: number
): readonly ShipTreeClassSkill[] => group?.prereqsByFaction[String(factionID)] ?? [];

export function classUnlocked(
  group: ShipTreeGroup | undefined,
  factionID: number,
  trainedLevel: (skillTypeID: number) => number
): boolean {
  return prereqs(group, factionID).every((p) => trainedLevel(p.skillTypeID) >= p.level);
}

export function classNeedsOmega(
  group: ShipTreeGroup | undefined,
  factionID: number,
  alphaMaxLevel: (skillTypeID: number) => number
): boolean {
  return prereqs(group, factionID).some((p) => p.level > alphaMaxLevel(p.skillTypeID));
}

export function parentEmpires(
  group: ShipTreeGroup | undefined,
  factionID: number,
  skillName: (skillTypeID: number) => string | undefined
): number[] {
  if (EMPIRE_FACTION_IDS.has(factionID) || factionID === ORE_FACTION_ID) return [];
  const empires = new Set<number>();
  for (const p of prereqs(group, factionID)) {
    if (!p.display) continue;
    const empire = EMPIRE_BY_PREFIX[skillName(p.skillTypeID)?.split(' ')[0] ?? ''];
    if (empire !== undefined) empires.add(empire);
  }
  return empires.size === 2 ? [...empires].sort((a, b) => b - a) : [];
}

export function tileTone(status: ShipTreeHullStatus | undefined): ShipTreeTileTone {
  if (!status?.canFly) return 'locked';
  return status.mastery >= 5 ? 'elite' : 'canFly';
}
