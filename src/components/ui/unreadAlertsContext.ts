import { createContext } from 'react';

/** What the bell badge says: how many alerts wait, and whether one of them is danger. */
export interface AlertBadge {
  count: number;
  /** An unacknowledged danger Alert exists, so the badge turns red. */
  danger: boolean;
}

export const NO_ALERTS: AlertBadge = { count: 0, danger: false };

/**
 * The bell's badge, read once by the app shell (`Layout`, via
 * `useAlertBadge`) and handed down so every `PageHeader`'s bell shares one
 * Dexie live query instead of opening one per route. Outside the shell (tests,
 * Storybook) it is `NO_ALERTS`: a dim bell with no badge.
 */
export const UnreadAlertsContext = createContext<AlertBadge>(NO_ALERTS);
