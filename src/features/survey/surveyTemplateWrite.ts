/**
 * Fills a brand-new Survey's Additional information from a template picked on
 * the empty page, the same two writes the panel makes when the pilot types them:
 * the location and notes, and the moon tax. The tax is stored even though the
 * Survey shows it only once a moon ore is scanned; readers decide that.
 */
import type { InfoTemplate } from '@/engine/survey/infoTemplate';
import { setSurveyInfo, setSurveyTax } from './surveyStore';

export async function writeTemplateToSurvey(
  survey: { id: string; expiresAt: number },
  template: InfoTemplate,
  characterId: number
): Promise<void> {
  const { id, expiresAt } = survey;
  if (template.location || template.notes) {
    await setSurveyInfo({
      id,
      expiresAt,
      location: template.location ?? null,
      notes: template.notes ?? '',
      characterId,
    });
  }
  if (template.tax) {
    await setSurveyTax({
      id,
      expiresAt,
      name: template.tax.name,
      pct: template.tax.pct,
      characterId,
    });
  }
}
