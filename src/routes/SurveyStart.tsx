import { useMarkPublicRouteRendered } from '@/app/routeFocus';
import { SurveyStartScreen } from '@/features/survey/SurveyStartScreen';

/** A **Survey start link**, `/s/new?…`: public like every `/s` page, so it sits outside the login gate. */
export function SurveyStart() {
  useMarkPublicRouteRendered();
  return <SurveyStartScreen />;
}
