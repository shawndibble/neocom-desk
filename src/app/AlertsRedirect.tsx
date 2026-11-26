import { Navigate, useLocation } from 'react-router-dom';
import { ALERTS_PANEL_PATH } from '@/features/notifications/alertsPanelPath';

export function AlertsRedirect() {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  params.set('alerts', '1');
  return <Navigate replace to={{ pathname: ALERTS_PANEL_PATH, search: `?${params}` }} />;
}
