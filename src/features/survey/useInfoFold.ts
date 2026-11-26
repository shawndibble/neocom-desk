import { useState } from 'react';
import { startedHere } from './startedHere';
import type { SurveyInfoShare, SurveyTaxShare } from './surveyStore';

export function useInfoFold(
  surveyId: string | undefined,
  stored: { info?: SurveyInfoShare | null; tax?: SurveyTaxShare | null }
) {
  const [expanded, setExpanded] = useState(() => {
    const hasDetails =
      stored.info?.location != null || (stored.info?.notes ?? '') !== '' || stored.tax != null;
    return hasDetails || surveyId === undefined || !startedHere(surveyId);
  });
  return {
    expanded,
    onToggle: () => setExpanded((open) => !open),
    open: () => setExpanded(true),
  };
}
