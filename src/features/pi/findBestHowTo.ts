/**
 * "Show me how" for one recipe, shaped for drawing: the pins to build, the
 * Command Center it needs, and what a week of running it yields. All of it
 * comes from the recommendation model's layout for the recipe, so the steps,
 * the meter and the ISK figure are never two answers.
 */
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
  /** How many factories of this kind the layout builds. */
  count: number;
  makes: HowToItem[];
}

export interface HowTo {
  launchpads: number;
  storage: number;
  extractors: HowToItem[];
  /** Heads on each extractor, as the fit assumed; null when the layout does not say. */
  headsPerExtractor: number | null;
  factories: HowToFactoryLine[];
  fit: RecipeFit | null;
  unitsPerWeek: number;
  m3PerWeek: number;
}

/** "1 extractor + 2 basic factories": the caption under a recipe's name. */
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
