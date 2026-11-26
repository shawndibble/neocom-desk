import { surveySnapshotOf, type SurveyScanSnapshot } from '@/engine/corpTaxBook/extraction';
import { firstCountedScan } from '@/engine/survey/series';
import type { LoadSurveyResult } from '@/features/survey/surveyStore';
import { loadMoonOreTypeIds, loadTypes } from '@/sde/loadSde';

export async function loadMoonOreTypeIdByName(): Promise<ReadonlyMap<string, number>> {
  const [moonIds, types] = await Promise.all([loadMoonOreTypeIds(), loadTypes()]);
  const byName = new Map<string, number>();
  for (const id of moonIds) {
    const name = types[String(id)]?.name;
    if (name) byName.set(name, id);
  }
  return byName;
}

export function keptSurveyScan(
  survey: LoadSurveyResult,
  typeIdByName: ReadonlyMap<string, number>
): SurveyScanSnapshot | undefined {
  if (!survey.ok) return undefined;
  const first = firstCountedScan(survey.scans, survey.ignored);
  if (!first) return undefined;
  return surveySnapshotOf(first.rocks, (ore) => typeIdByName.get(ore), first.at);
}
