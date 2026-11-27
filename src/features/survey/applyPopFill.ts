import type { InfoSurvey } from './SurveyInfoPanel';
import { popSurveyFill, type PopSurveyDetails } from './popLinkCandidates';
import { setSurveyInfo, setSurveyTax } from './surveyStore';

export async function applyPopFill(
  survey: InfoSurvey,
  characterId: number,
  details: PopSurveyDetails
): Promise<void> {
  const fill = popSurveyFill(details, {
    location: survey.info?.location ?? null,
    tax: survey.published,
  });
  const base = { id: survey.id, expiresAt: survey.expiresAt, characterId };
  await Promise.allSettled([
    fill.location &&
      setSurveyInfo({ ...base, location: fill.location, notes: survey.info?.notes ?? '' }),
    fill.tax && setSurveyTax({ ...base, name: fill.tax.name, pct: fill.tax.pct }),
  ]);
}
