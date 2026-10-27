import { Navigate, useLocation } from 'react-router-dom';
import { ALERTS_PANEL_PATH } from '@/features/notifications/alertsPanelPath';

/**
 * The retired Alerts page. Alerts live in the bell's panel now, so `/alerts`
 * (the command palette, the `a` shortcut, a tapped push notification, an old
 * link) lands on the Overview with that panel open. A `?character=` an alt's
 * push carries is kept: `AlertCharacterSwitch` reads it on arrival and
 * switches Character, then drops it.
 */
export function AlertsRedirect() {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  params.set('alerts', '1');
  return <Navigate replace to={{ pathname: ALERTS_PANEL_PATH, search: `?${params}` }} />;
}
