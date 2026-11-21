/**
 * `/corp/moons`'s URLs (ADR 0015): the tab is a path segment, and the drill-down pages live below their tab (`PageTab.deep`), so the page stays
 * mounted and Back returns to the table.
 */
import type { MinerBalance } from '@/engine/corpTaxBook/overdueAging';
import { HIGHLIGHT_PARAM } from '@/lib/highlightParam';
import { definePageTabs, tabPath } from '@/lib/pageTabs';

export const MOONS_TABS = definePageTabs('/corp/moons', [
  { id: 'overview', labelKey: 'corpTaxBook.moons.tabs.overview' },
  { id: 'extractions', labelKey: 'corpTaxBook.moons.tabs.extractions', deep: true },
  { id: 'refineries', labelKey: 'corpTaxBook.moons.tabs.refineries', deep: true },
  // The retired Moons tab (#6348): its URLs redirect to the refinery they name.
  { id: 'moons', labelKey: 'corpTaxBook.moons.tabs.refineries', deep: true, standalone: true },
  { id: 'miners', labelKey: 'corpTaxBook.moons.tabs.miners', deep: true },
  { id: 'late-notices', labelKey: 'corpTaxBook.moons.tabs.lateNotices', deep: true },
  // The tab's old URL, and the retired period pages below it (#6294): bookmarks and old mail links
  // redirect to Late notices.
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
  /** The retired moon page `/corp/moons/moons/:moonId`: redirects to the moon's newest refinery. */
  | { kind: 'legacyMoon'; id: string }
  | { kind: 'miner'; id: string }
  | { kind: 'moonOwner'; id: string }
  /** A refinery's page (#6348), ours or a moon owner's. */
  | { kind: 'refinery'; structureId: number }
  /** The retired moon owner's refinery page (#6298): redirects to `refinery`. */
  | { kind: 'legacyRefinery'; structureId: number }
  /** The retired period page `/corp/moons/statements/:period`: redirects to the Late notices tab. */
  | { kind: 'legacyStatementPeriod' }
  | null;

/** The refinery, Miner, moon owner, or Extraction page a pathname names, if any. */
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
/** A refinery's page (#6348): its moon, owner, ore, every Extraction and every Miner. */
export const refineryPath = (structureId: number) => `/corp/moons/refineries/${structureId}`;
export const refineriesTabPath = tabPath(MOONS_TABS, 'refineries');
export const lateNoticesTabPath = tabPath(MOONS_TABS, 'late-notices');
export const minerPath = (id: string) => `/corp/moons/miners/${encodeURIComponent(id)}`;
export const moonOwnerPath = (id: string) => `/corp/moons/moon-owners/${encodeURIComponent(id)}`;

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
