import type { SurveySummary } from '@/engine/survey/series';
import { SurveyInfoEditor, SurveyInfoReadout, type InfoSurvey } from './SurveyInfoPanel';
import type { SurveyInfoShare, SurveyTaxShare } from './surveyStore';
import { SurveyPopLinkPrompt } from './SurveyPopLinkPrompt';
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
      <>
        {survey && moon && (
          <SurveyPopLinkPrompt
            key={survey.id}
            survey={survey}
            characterId={characterId}
            oreNames={summary.oreNames}
            onStored={onStored}
          />
        )}
        <SurveyInfoEditor
          key={survey?.id}
          characterId={characterId}
          survey={survey}
          connect={connect}
          moon={moon}
          onStored={onStored}
        />
      </>
    );
  }
  return <SurveyInfoReadout info={info} tax={moon ? tax : null} connect={connect} />;
}
