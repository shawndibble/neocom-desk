/**
 * Per-class and per-tile rules the Ship Tree draws from: is a class
 * unlocked, does it need an Omega clone, which empires a pirate class
 * descends from, and how a hull's tile is toned.
 */
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

/** An empire skill's name prefix -> that empire's faction id. */
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

/** ISIS "unlocked class": every class prereq for this faction trained, displayed or not. */
export function classUnlocked(
  group: ShipTreeGroup | undefined,
  factionID: number,
  trainedLevel: (skillTypeID: number) => number
): boolean {
  return prereqs(group, factionID).every((p) => trainedLevel(p.skillTypeID) >= p.level);
}

/** Any class prereq, displayed or not, above what an Alpha clone can train. */
export function classNeedsOmega(
  group: ShipTreeGroup | undefined,
  factionID: number,
  alphaMaxLevel: (skillTypeID: number) => number
): boolean {
  return prereqs(group, factionID).some((p) => p.level > alphaMaxLevel(p.skillTypeID));
}

/**
 * The two empires a pirate class's displayed prereqs come from, sorted by
 * descending faction id so the same empire stays on top in every column
 * (Guristas: [Gallente, Caldari] — Caldari above, as in game). Returned as
 * [bottom, top], and only when there are exactly two; [] for the empires,
 * ORE, and anything else.
 */
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

/**
 * ISIS tile tone: gold only at Mastery V (the in-game "elite" look), full
 * brightness when flyable, dimmed otherwise.
 */
export function tileTone(status: ShipTreeHullStatus | undefined): ShipTreeTileTone {
  if (!status?.canFly) return 'locked';
  return status.mastery >= 5 ? 'elite' : 'canFly';
}
