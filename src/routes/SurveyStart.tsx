import { useMarkPublicRouteRendered } from '@/app/routeFocus';
import { SurveyStartScreen } from '@/features/survey/SurveyStartScreen';

export function SurveyStart() {
  useMarkPublicRouteRendered();
  return <SurveyStartScreen />;
}
