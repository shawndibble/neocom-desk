import type { SurveyRock } from './series';

export const SCAN_UPDATE_TOLERANCE = 0.01;

function volumeByOre(rocks: readonly SurveyRock[]): Map<string, number> {
  const byOre = new Map<string, number>();
  for (const rock of rocks) byOre.set(rock.ore, (byOre.get(rock.ore) ?? 0) + rock.volume);
  return byOre;
}

export function classifyScan(
  latest: readonly SurveyRock[] | null,
  pasted: readonly SurveyRock[]
): 'update' | 'different' {
  if (latest === null) return 'different';
  const before = volumeByOre(latest);
  for (const [ore, volume] of volumeByOre(pasted)) {
    const was = before.get(ore);
    if (was === undefined || volume > was * (1 + SCAN_UPDATE_TOLERANCE)) return 'different';
  }
  return 'update';
}

export function lastSeenField(scans: readonly (readonly SurveyRock[])[]): SurveyRock[] | null {
  if (scans.length === 0) return null;
  const seen = new Map<string, number>();
  for (const rocks of scans) {
    for (const [ore, volume] of volumeByOre(rocks)) seen.set(ore, volume);
  }
  return [...seen].map(([ore, volume]) => ({ ore, volume }));
}

export function missingOres(
  latest: readonly SurveyRock[] | null,
  pasted: readonly SurveyRock[]
): string[] {
  if (latest === null) return [];
  const present = new Set(pasted.map((rock) => rock.ore));
  return [...new Set(latest.map((rock) => rock.ore))].filter((ore) => !present.has(ore));
}
