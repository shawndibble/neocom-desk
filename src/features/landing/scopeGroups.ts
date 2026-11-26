import { WRITE_GROUPS, type ScopeGroup } from '@/esi/registry';

export type ScopeRow =
  { kind: 'core'; key: 'skills' | 'structures' } | { kind: 'group'; group: ScopeGroup };

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
      { kind: 'group', group: 'militaryCampaigns' },
    ],
  },
  {
    id: 'industry',
    rows: [
      { kind: 'group', group: 'industry' },
      { kind: 'group', group: 'corpProjects' },
      { kind: 'group', group: 'mining' },
      { kind: 'group', group: 'planets' },
      { kind: 'group', group: 'mercenaryDens' },
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
      { kind: 'group', group: 'jumpFatigue' },
      { kind: 'group', group: 'killmails' },
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
  {
    id: 'write',
    rows: WRITE_GROUPS.map((group) => ({ kind: 'group', group })),
  },
];

export const PLACED_GROUPS: readonly ScopeGroup[] = LANDING_SCOPE_GROUPS.flatMap(({ rows }) =>
  rows.flatMap((row) => (row.kind === 'group' ? [row.group] : []))
);
