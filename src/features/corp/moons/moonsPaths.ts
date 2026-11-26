import type { MinerBalance } from '@/engine/corpTaxBook/overdueAging';
import { HIGHLIGHT_PARAM } from '@/lib/highlightParam';
import { definePageTabs, tabPath } from '@/lib/pageTabs';

export const MOONS_TABS = definePageTabs('/corp/moons', [
  { id: 'overview', labelKey: 'corpTaxBook.moons.tabs.overview' },
  { id: 'extractions', labelKey: 'corpTaxBook.moons.tabs.extractions', deep: true },
  { id: 'refineries', labelKey: 'corpTaxBook.moons.tabs.refineries', deep: true },
  { id: 'moons', labelKey: 'corpTaxBook.moons.tabs.refineries', deep: true, standalone: true },
  { id: 'miners', labelKey: 'corpTaxBook.moons.tabs.miners', deep: true },
  { id: 'late-notices', labelKey: 'corpTaxBook.moons.tabs.lateNotices', deep: true },
  {
    id: 'statements',
    labelKey: 'corpTaxBook.moons.tabs.lateNotices',
    deep: true,
    standalone: true,
  },
  { id: 'moon-owners', labelKey: 'corpTaxBook.moons.tabs.moonOwners', deep: true },
]);

export type MoonsDetail =
  | { kind: 'extraction'; id: string }
  | { kind: 'legacyMoon'; id: string }
  | { kind: 'miner'; id: string }
  | { kind: 'moonOwner'; id: string }
  | { kind: 'refinery'; structureId: number }
  | { kind: 'legacyRefinery'; structureId: number }
  | { kind: 'legacyStatementPeriod' }
  | null;

export function moonsDetail(pathname: string): MoonsDetail {
  const legacy = /^\/corp\/moons\/moon-owners\/[^/]+\/refineries\/(\d+)\/?$/.exec(pathname);
  if (legacy) return { kind: 'legacyRefinery', structureId: Number(legacy[1]) };
  const match =
    /^\/corp\/moons\/(extractions|refineries|moons|miners|moon-owners|statements)\/([^/]+)\/?$/.exec(
      pathname
    );
  if (!match) return null;
  const id = decodeURIComponent(match[2]);
  if (match[1] === 'extractions') return { kind: 'extraction', id };
  if (match[1] === 'refineries') {
    return /^\d+$/.test(id) ? { kind: 'refinery', structureId: Number(id) } : null;
  }
  if (match[1] === 'moons') return { kind: 'legacyMoon', id };
  if (match[1] === 'statements') return { kind: 'legacyStatementPeriod' };
  return match[1] === 'miners' ? { kind: 'miner', id } : { kind: 'moonOwner', id };
}

export const extractionPath = (id: string) => `/corp/moons/extractions/${encodeURIComponent(id)}`;
export const refineryPath = (structureId: number) => `/corp/moons/refineries/${structureId}`;
export const refineriesTabPath = tabPath(MOONS_TABS, 'refineries');
export const lateNoticesTabPath = tabPath(MOONS_TABS, 'late-notices');
export const minerPath = (id: string) => `/corp/moons/miners/${encodeURIComponent(id)}`;
export const moonOwnerPath = (id: string) => `/corp/moons/moon-owners/${encodeURIComponent(id)}`;

export const SETTINGS_TABS = ['rates', 'billing', 'extractions', 'sharing', 'access'] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];
export const isSettingsTab = (v: string | null): v is SettingsTab =>
  SETTINGS_TABS.some((tab) => tab === v);

export const SETTINGS_PARAM = 'settings';

export const sharingMoonPath = (moonId: number) =>
  `${tabPath(MOONS_TABS, 'extractions')}?${SETTINGS_PARAM}=sharing&${HIGHLIGHT_PARAM}=${moonId}`;

export function legacyMoonsLocation(
  pathname: string,
  search: string
): { pathname: string; search: string } | null {
  if (pathname.replace(/\/$/, '') !== '/corp/moons/sharing') return null;
  const params = new URLSearchParams(search);
  params.set(SETTINGS_PARAM, 'sharing');
  return { pathname: tabPath(MOONS_TABS, 'overview'), search: `?${params.toString()}` };
}

export const minersBalancePath = (balance: MinerBalance) =>
  `${tabPath(MOONS_TABS, 'miners')}?balance=${balance}`;
