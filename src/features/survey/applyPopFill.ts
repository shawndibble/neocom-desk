import type { InfoLocation } from '@/engine/survey/infoTemplate';
import type { InfoSurvey } from './SurveyInfoPanel';
import { setSurveyInfo, setSurveyTax, type SurveyTaxShare } from './surveyStore';

export async function applyPopFill(
  survey: InfoSurvey,
  characterId: number,
  fill: { location?: InfoLocation; tax?: SurveyTaxShare }
): Promise<void> {
  if (fill.location) {
    await setSurveyInfo({
      id: survey.id,
      expiresAt: survey.expiresAt,
      location: fill.location,
      notes: survey.info?.notes ?? '',
      characterId,
    });
  }
  if (fill.tax) {
    await setSurveyTax({
      id: survey.id,
      expiresAt: survey.expiresAt,
      name: fill.tax.name,
      pct: fill.tax.pct,
      characterId,
    });
  }
}
