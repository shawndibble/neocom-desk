/**
 * The Charge Picker's crystal guide: a mining laser's 66–72 crystals,
 * grouped by the ore family each is cut for (`Simple Asteroid`, `Rare
 * Moon` …) with its ores named, and each family's six crystals (Type A,
 * B, C, each Tech I and II) in one order so they read side by side.
 *
 * Pure. A crystal's family is in its name; the ores in each family are a
 * table here, since the SDE's type lists behind a crystal's "valid target
 * types" (attribute 3148) aren't in this app's data.
 */
import type { ChargeChoice } from './chargeChoice';

export type CrystalLetter = 'A' | 'B' | 'C';

export interface CrystalName {
  /** "Simple Asteroid", "Rare Moon", "Erratic Ore". */
  family: string;
  letter: CrystalLetter;
  techLevel: 1 | 2;
}

export interface CrystalChoice extends CrystalName {
  choice: ChargeChoice;
}

export interface CrystalFamilyGroup {
  family: string;
  /** The ores it's cut for; empty where this app doesn't know them. */
  ores: readonly string[];
  /** A I, A II, B I, B II, C I, C II — whichever the module takes. */
  crystals: CrystalChoice[];
}

/** Each family's ores, in the order the families come up in a belt, then moons. */
export const CRYSTAL_FAMILY_ORES: Readonly<Record<string, readonly string[]>> = {
  'Simple Asteroid': ['Veldspar', 'Scordite', 'Pyroxeres', 'Plagioclase'],
  'Coherent Asteroid': ['Omber', 'Kernite', 'Jaspet', 'Hemorphite', 'Hedbergite'],
  'Variegated Asteroid': ['Gneiss', 'Dark Ochre', 'Crokite'],
  'Complex Asteroid': ['Arkonor', 'Bistot', 'Spodumain'],
  'Abyssal Asteroid': ['Talassonite', 'Rakovene', 'Bezdnacine'],
  'Mercoxit Asteroid': ['Mercoxit'],
  'Ubiquitous Moon': ['Zeolites', 'Sylvite', 'Bitumens', 'Coesite'],
  'Common Moon': ['Cobaltite', 'Euxenite', 'Titanite', 'Scheelite'],
  'Uncommon Moon': ['Otavite', 'Sperrylite', 'Vanadinite', 'Chromite'],
  'Rare Moon': ['Carnotite', 'Zircon', 'Pollucite', 'Cinnabar'],
  'Exceptional Moon': ['Xenotime', 'Monazite', 'Loparite', 'Ytterbite'],
};

const FAMILY_ORDER = Object.keys(CRYSTAL_FAMILY_ORES);
const NAME = /^(.+? (?:Asteroid|Moon|Ore)) Mining Crystal Type ([ABC]) (I{1,2})$/;

export function parseCrystal(name: string): CrystalName | null {
  const match = NAME.exec(name);
  if (!match) return null;
  return {
    family: match[1]!,
    letter: match[2] as CrystalLetter,
    techLevel: match[3] === 'II' ? 2 : 1,
  };
}

/** The crystals among `choices`, by family (belt order, unknown families last). */
export function groupCrystals(choices: readonly ChargeChoice[]): CrystalFamilyGroup[] {
  const byFamily = new Map<string, CrystalChoice[]>();
  for (const choice of choices) {
    const parsed = parseCrystal(choice.name);
    if (!parsed) continue;
    const list = byFamily.get(parsed.family) ?? [];
    list.push({ ...parsed, choice });
    byFamily.set(parsed.family, list);
  }
  const rank = (family: string) => {
    const index = FAMILY_ORDER.indexOf(family);
    return index === -1 ? FAMILY_ORDER.length : index;
  };
  return [...byFamily.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([family, crystals]) => ({
      family,
      ores: CRYSTAL_FAMILY_ORES[family] ?? [],
      crystals: crystals.sort(
        (a, b) => a.letter.localeCompare(b.letter) || a.techLevel - b.techLevel
      ),
    }));
}
