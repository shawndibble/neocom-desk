/**
 * `/corp/moons`'s URLs (ADR 0015): the tab is a path segment, and the two
 * drill-down pages live below their tab (`PageTab.deep`), so the page stays
 * mounted and Back returns to the table.
 */
import type { MinerBalance } from '@/engine/corpTaxBook/overdueAging';
import { HIGHLIGHT_PARAM } from '@/lib/highlightParam';
import { definePageTabs, tabPath } from '@/lib/pageTabs';

export const MOONS_TABS = definePageTabs('/corp/moons', [
  { id: 'overview', labelKey: 'corpTaxBook.moons.tabs.overview' },
  { id: 'extractions', labelKey: 'corpTaxBook.moons.tabs.extractions', deep: true },
  { id: 'moons', labelKey: 'corpTaxBook.moons.tabs.moons', deep: true },
  { id: 'miners', labelKey: 'corpTaxBook.moons.tabs.miners', deep: true },
  { id: 'statements', labelKey: 'corpTaxBook.moons.tabs.statements', deep: true },
  { id: 'moon-owners', labelKey: 'corpTaxBook.moons.tabs.moonOwners', deep: true },
]);

export type MoonsDetail =
  | { kind: 'extraction'; id: string }
  | { kind: 'moon'; id: string }
  | { kind: 'miner'; id: string }
  | { kind: 'moonOwner'; id: string }
  /** A moon owner's refinery page (#6298): `id` is the moon owner, `structureId` the refinery. */
  | { kind: 'refinery'; id: string; structureId: number }
  | { kind: 'statementPeriod'; id: string }
  | null;

/** The moon, Miner, moon owner, refinery or Statements period page a pathname names, if any. */
export function moonsDetail(pathname: string): MoonsDetail {
  const refinery = /^\/corp\/moons\/moon-owners\/([^/]+)\/refineries\/(\d+)\/?$/.exec(pathname);
  if (refinery) {
    return {
      kind: 'refinery',
      id: decodeURIComponent(refinery[1]),
      structureId: Number(refinery[2]),
    };
  }
  const match =
    /^\/corp\/moons\/(extractions|moons|miners|moon-owners|statements)\/([^/]+)\/?$/.exec(pathname);
  if (!match) return null;
  const id = decodeURIComponent(match[2]);
  if (match[1] === 'extractions') return { kind: 'extraction', id };
  if (match[1] === 'moons') return { kind: 'moon', id };
  if (match[1] === 'statements') return { kind: 'statementPeriod', id };
  return match[1] === 'miners' ? { kind: 'miner', id } : { kind: 'moonOwner', id };
}

export const extractionPath = (id: string) => `/corp/moons/extractions/${encodeURIComponent(id)}`;
/** A moon's page: every Extraction the book synced for it (#6299). */
export const moonPath = (moonId: number) => `/corp/moons/moons/${moonId}`;
export const moonsTabPath = tabPath(MOONS_TABS, 'moons');
export const minerPath = (id: string) => `/corp/moons/miners/${encodeURIComponent(id)}`;
export const moonOwnerPath = (id: string) => `/corp/moons/moon-owners/${encodeURIComponent(id)}`;
/** A moon owner's refinery page (#6298), below the moon owner's own. */
export const moonOwnerRefineryPath = (ownerId: string | number, structureId: number) =>
  `${moonOwnerPath(String(ownerId))}/refineries/${structureId}`;
export const statementPeriodPath = (periodStart: string) =>
  `/corp/moons/statements/${encodeURIComponent(periodStart)}`;

/** Moon settings' tabs, in the order the dialog shows them. */
export const SETTINGS_TABS = ['rates', 'billing', 'extractions', 'sharing', 'access'] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];
export const isSettingsTab = (v: string | null): v is SettingsTab =>
  SETTINGS_TABS.some((tab) => tab === v);

/** `?settings=<tab>`: opens Moon settings on that tab once, whichever Moons tab it rides on. */
export const SETTINGS_PARAM = 'settings';

/**
 * A moon's row on Moon settings' Sharing tab, scrolled to and pulsed (`?highlight=`).
 * Sharing was a Moons page tab (#6222) until #6304 moved it into Moon settings.
 */
export const sharingMoonPath = (moonId: number) =>
  `${tabPath(MOONS_TABS, 'extractions')}?${SETTINGS_PARAM}=sharing&${HIGHLIGHT_PARAM}=${moonId}`;

/** The retired `/corp/moons/sharing` tab opens Moon settings on Sharing; its query rides along. */
export function legacyMoonsLocation(
  pathname: string,
  search: string
): { pathname: string; search: string } | null {
  if (pathname.replace(/\/$/, '') !== '/corp/moons/sharing') return null;
  const params = new URLSearchParams(search);
  params.set(SETTINGS_PARAM, 'sharing');
  return { pathname: tabPath(MOONS_TABS, 'overview'), search: `?${params.toString()}` };
}

/** The Miners tab narrowed by its Balance filter (`?balance=`): who owes, who is overdue, who holds credit. */
export const minersBalancePath = (balance: MinerBalance) =>
  `${tabPath(MOONS_TABS, 'miners')}?balance=${balance}`;
