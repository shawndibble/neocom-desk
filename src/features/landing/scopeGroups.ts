import { type ScopeGroup } from '@/esi/registry';

/**
 * One line of the landing page's "what it asks EVE for" list: either a Core
 * Grant row (skills, structure lookup; hand-written in the Customize
 * permissions dialog too, for the same reason: `CORE_GRANT` is four raw scope
 * names) or one Permission (Scope Group) from `esi/registry.ts`.
 */
export type ScopeRow =
  { kind: 'core'; key: 'skills' | 'structures' } | { kind: 'group'; group: ScopeGroup };

/**
 * The landing page's grouping of everything the app can ask EVE for, by the
 * area a pilot thinks in. Every Permission in `SCOPE_GROUPS` and both Core
 * Grant rows sit in exactly one group; `scopeGroups.test.ts` fails when a
 * Permission is added to the registry without being placed here, so the
 * disclosure cannot fall behind what the app requests. The labels and
 * captions come from `permissions.*`, the same strings the Customize
 * permissions dialog shows.
 */
export const LANDING_SCOPE_GROUPS: readonly { id: string; rows: readonly ScopeRow[] }[] = [
  {
    id: 'skills',
    rows: [
      { kind: 'core', key: 'skills' },
      { kind: 'group', group: 'characterDetails' },
    ],
  },
  {
    id: 'money',
    rows: [
      { kind: 'group', group: 'wallet' },
      { kind: 'group', group: 'marketOrders' },
      { kind: 'group', group: 'contracts' },
      { kind: 'group', group: 'assets' },
    ],
  },
  {
    id: 'industry',
    rows: [
      { kind: 'group', group: 'industry' },
      { kind: 'group', group: 'corpProjects' },
      { kind: 'group', group: 'mining' },
      { kind: 'group', group: 'planets' },
    ],
  },
  {
    id: 'social',
    rows: [
      { kind: 'group', group: 'mail' },
      { kind: 'group', group: 'calendar' },
      { kind: 'group', group: 'notifications' },
    ],
  },
  {
    id: 'location',
    rows: [
      { kind: 'group', group: 'currentShip' },
      { kind: 'group', group: 'fittings' },
      { kind: 'group', group: 'autopilot' },
      { kind: 'group', group: 'openWindow' },
      { kind: 'group', group: 'jumpFatigue' },
    ],
  },
  {
    id: 'structures',
    rows: [
      { kind: 'core', key: 'structures' },
      { kind: 'group', group: 'structureMarkets' },
      { kind: 'group', group: 'corp' },
    ],
  },
];

/** Every Permission placed in a landing group, for the drift test. */
export const PLACED_GROUPS: readonly ScopeGroup[] = LANDING_SCOPE_GROUPS.flatMap(({ rows }) =>
  rows.flatMap((row) => (row.kind === 'group' ? [row.group] : []))
);
