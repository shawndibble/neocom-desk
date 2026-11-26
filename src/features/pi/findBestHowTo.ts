import type { RecipeFit, RecipeRank } from '@/engine/pi/planRecipes';
import type { PinCounts } from '@/engine/pi/types';
import type { PiData } from '@/sde/types';

export const DAYS_PER_WEEK = 7;

export interface HowToItem {
  typeId: number;
  name: string;
}

export interface HowToFactoryLine {
  kind: 'basic' | 'advanced' | 'highTech';
  count: number;
  makes: HowToItem[];
}

export interface HowTo {
  launchpads: number;
  storage: number;
  extractors: HowToItem[];
  headsPerExtractor: number | null;
  factories: HowToFactoryLine[];
  fit: RecipeFit | null;
  unitsPerWeek: number;
  m3PerWeek: number;
}

export function setupParts(pins: PinCounts): {
  extractors: number;
  basic: number;
  advanced: number;
  highTech: number;
} {
  return {
    extractors: pins.extractorControlUnit ?? 0,
    basic: pins.basic ?? 0,
    advanced: pins.advanced ?? 0,
    highTech: pins.highTech ?? 0,
  };
}

export function buildHowTo(recipe: RecipeRank, pi: PiData): HowTo | null {
  const { layout } = recipe;
  if (!layout) return null;
  const nameOf = (typeId: number) =>
    pi.raw.find((raw) => raw.typeID === typeId)?.name ??
    pi.schematics[String(typeId)]?.name ??
    String(typeId);
  const pins = layout.pins;

  const factories: HowToFactoryLine[] = (['basic', 'advanced', 'highTech'] as const).flatMap(
    (kind) => {
      const makes = layout.makes
        .filter((make) => make.facility === kind)
        .map((make) => ({ typeId: make.typeId, name: nameOf(make.typeId) }));
      return makes.length === 0
        ? []
        : [{ kind, count: Math.max(pins[kind] ?? 0, makes.length), makes }];
    }
  );

  return {
    launchpads: pins.launchpad ?? 0,
    storage: pins.storage ?? 0,
    extractors: layout.extracts.map((typeId) => ({ typeId, name: nameOf(typeId) })),
    headsPerExtractor: layout.headsPerExtractor ?? null,
    factories,
    fit: layout.fit ?? null,
    unitsPerWeek: layout.unitsPerDay * DAYS_PER_WEEK,
    m3PerWeek: recipe.m3PerDay * DAYS_PER_WEEK,
  };
}
