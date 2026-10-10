import { createContext } from 'react';

/**
 * How many alerts are waiting, read once by the app shell (`Layout`) and handed
 * down so every `PageHeader`'s bell shares one Dexie live query instead of
 * opening one per route. Outside the shell (tests, the styleguide) it is 0,
 * which draws no bell.
 */
export const UnreadAlertsContext = createContext(0);
