import { createContext } from 'react';

export interface AlertBadge {
  count: number;
  danger: boolean;
}

export const NO_ALERTS: AlertBadge = { count: 0, danger: false };

export const UnreadAlertsContext = createContext<AlertBadge>(NO_ALERTS);
