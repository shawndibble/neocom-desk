/**
 * The Additional information panel: location, the moon tax (only once the Survey
 * shows a moon ore) and notes. The pilot who started the Survey edits it and
 * stores it on the Survey; anyone else opening it sees what the owner stored,
 * read-only, so their own saved tax can't overwrite it. Shared by the Survey tab
 * and the public page a signed-in owner opens.
 */
import type { SurveySummary } from '@/engine/survey/series';
import { SurveyInfoEditor, SurveyInfoReadout, type InfoSurvey } from './SurveyInfoPanel';
import type { SurveyInfoShare, SurveyTaxShare } from './surveyStore';
import { useHasMoonOre } from './useHasMoonOre';

export function SurveyInfoLine({
  characterId,
  summary,
  owned,
  tax,
  info,
  survey,
  onStored,
}: {
  characterId: number;
  summary: SurveySummary;
  owned: boolean;
  tax: SurveyTaxShare | null;
  info: SurveyInfoShare | null;
  survey?: InfoSurvey;
  onStored: () => void;
}) {
  const moon = useHasMoonOre(summary.oreNames);
  const connect = survey && { id: survey.id, expiresAt: survey.expiresAt, summary };
  if (owned) {
    return (
      <SurveyInfoEditor
        key={survey?.id}
        characterId={characterId}
        survey={survey}
        connect={connect}
        moon={moon}
        onStored={onStored}
      />
    );
  }
  return <SurveyInfoReadout info={info} tax={moon ? tax : null} connect={connect} />;
}
