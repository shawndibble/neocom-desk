import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { SkillPlanImportState } from '@/lib/shortcuts';

/**
 * What the route's location state asks of this editor, spent as soon as it is read so a
 * reload or Back cannot act on it twice: the "New plan" rename focus (narrow screens only)
 * and a skill plan pasted elsewhere (`pastedPlanText`).
 */
export function usePlanLocationFlags(isDesktop: boolean) {
  const navigate = useNavigate();
  // "New plan" navigates here with this flag. Wide screens have the list pane, whose row
  // takes the rename (and spends the flag); narrow ones have no list, so the header field does.
  const location = useLocation();
  const focusName =
    !isDesktop && (location.state as { focusName?: boolean } | null)?.focusName === true;
  // Spent once the field has focus, so a reload or Back doesn't re-steal it.
  useEffect(() => {
    if (focusName) navigate(location.pathname, { replace: true, state: null });
  }, [focusName, location.pathname, navigate]);
  // A skill plan pasted anywhere opens this editor with the Import dialog
  // already on it (`routes/SkillPlans.tsx` made the plan). Held in state so the
  // location can be spent at once: a reload or Back must not reopen it.
  const pastedPlanText = (location.state as Partial<SkillPlanImportState> | null)
    ?.skillPlanImportText;
  useEffect(() => {
    if (pastedPlanText) navigate(location.pathname, { replace: true, state: null });
  }, [pastedPlanText, location.pathname, navigate]);
  return { focusName, pastedPlanText };
}
