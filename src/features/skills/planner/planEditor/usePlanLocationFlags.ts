import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { SkillPlanImportState } from '@/lib/shortcuts';

export function usePlanLocationFlags(isDesktop: boolean) {
  const navigate = useNavigate();
  const location = useLocation();
  const focusName =
    !isDesktop && (location.state as { focusName?: boolean } | null)?.focusName === true;
  useEffect(() => {
    if (focusName) navigate(location.pathname, { replace: true, state: null });
  }, [focusName, location.pathname, navigate]);
  const pastedPlanText = (location.state as Partial<SkillPlanImportState> | null)
    ?.skillPlanImportText;
  useEffect(() => {
    if (pastedPlanText) navigate(location.pathname, { replace: true, state: null });
  }, [pastedPlanText, location.pathname, navigate]);
  return { focusName, pastedPlanText };
}
