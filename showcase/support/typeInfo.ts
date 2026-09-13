/**
 * `universeType:{typeId}` rows — the full `UniverseType` object (name,
 * description, dogma attributes), distinct from `typeNames.ts`'s
 * `type:{typeId}` rows, which hold a bare name string.
 *
 * Without these the Skills page and the skill queue render `#296` where a
 * skill name belongs: those surfaces resolve names through ESI's
 * `/universe/types/{id}`, not through the SDE snapshot. Skill rows are
 * generated straight out of `public/data/skills.json` so the names and
 * descriptions are the real ones; implants are declared here because the SDE
 * snapshot this app ships does not carry them.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { CacheRow } from './seed';
import { SKILL } from './world';

const GLOBAL = 0;

interface SkillSnapshotEntry {
  typeID: number;
  name: string;
  description: string;
  groupID: number;
}

const SKILLS: Record<string, SkillSnapshotEntry> = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../public/data/skills.json', import.meta.url)), 'utf-8')
);

/** dogma attribute_id -> character attribute, per `features/skills/dogma.ts`. */
const ATTR = {
  charisma: 175,
  intelligence: 176,
  memory: 177,
  perception: 178,
  willpower: 179,
} as const;

interface ImplantSpec {
  typeId: number;
  name: string;
  attribute: keyof typeof ATTR;
  bonus: number;
}

/** A full +5 set — the clone a pilot this deep into industry would be wearing. */
export const IMPLANTS: readonly ImplantSpec[] = [
  { typeId: 19_540, name: 'Limited Ocular Filter - Basic', attribute: 'perception', bonus: 5 },
  { typeId: 19_551, name: 'Limited Memory Augmentation - Basic', attribute: 'memory', bonus: 5 },
  { typeId: 19_553, name: 'Limited Neural Boost - Basic', attribute: 'willpower', bonus: 5 },
  { typeId: 19_554, name: 'Limited Cybernetic Subprocessor - Basic', attribute: 'intelligence', bonus: 5 },
  { typeId: 19_555, name: 'Limited Social Adaptation Chip - Basic', attribute: 'charisma', bonus: 5 },
];

export const IMPLANT_IDS: readonly number[] = IMPLANTS.map((implant) => implant.typeId);

function skillRow(typeId: number): CacheRow | null {
  const entry = Object.values(SKILLS).find((skill) => skill.typeID === typeId);
  if (!entry) return null;
  return {
    characterId: GLOBAL,
    key: `universeType:${typeId}`,
    value: {
      type_id: entry.typeID,
      name: entry.name,
      description: entry.description,
      group_id: entry.groupID,
      published: true,
    },
  };
}

/** Every `universeType:` row the showcase needs: all referenced skills, plus the implant set. */
export function typeInfoRows(): CacheRow[] {
  const skillRows = Object.values(SKILL)
    .map(skillRow)
    .filter((row): row is CacheRow => row !== null);

  const implantRows = IMPLANTS.map<CacheRow>((implant) => ({
    characterId: GLOBAL,
    key: `universeType:${implant.typeId}`,
    value: {
      type_id: implant.typeId,
      name: implant.name,
      description: `+${implant.bonus} ${implant.attribute} cybernetic implant.`,
      group_id: 300,
      published: true,
      dogma_attributes: [{ attribute_id: ATTR[implant.attribute], value: implant.bonus }],
    },
  }));

  return [...skillRows, ...implantRows];
}
