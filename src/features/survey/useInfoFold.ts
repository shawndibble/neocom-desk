/**
 * Whether a Survey's Additional information panel is open, for the pilot who edits
 * it. It opens, unless this device just started the Survey from `/survey` and left
 * the details empty: nothing to read yet, so it starts folded out of the way and the
 * caret opens it. After that the pilot's own toggle decides.
 */
import { useState } from 'react';
import { startedHere } from './startedHere';

export function useInfoFold(surveyId: string | undefined, hasDetails: boolean) {
  const [expanded, setExpanded] = useState(
    () => hasDetails || surveyId === undefined || !startedHere(surveyId)
  );
  return {
    expanded,
    onToggle: () => setExpanded((open) => !open),
    open: () => setExpanded(true),
  };
}
