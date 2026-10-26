/**
 * `/corp/moons`'s URLs (ADR 0015): the tab is a path segment, and the two
 * drill-down pages live below their tab (`PageTab.deep`), so the page stays
 * mounted and Back returns to the table.
 */
import { definePageTabs } from '@/lib/pageTabs';

export const MOONS_TABS = definePageTabs('/corp/moons', [
  { id: 'overview', labelKey: 'corpTaxBook.moons.tabs.overview' },
  { id: 'extractions', labelKey: 'corpTaxBook.moons.tabs.extractions', deep: true },
  { id: 'miners', labelKey: 'corpTaxBook.moons.tabs.miners', deep: true },
  { id: 'statements', labelKey: 'corpTaxBook.moons.tabs.statements', deep: true },
  { id: 'moon-owners', labelKey: 'corpTaxBook.moons.tabs.moonOwners', deep: true },
]);

export type MoonsDetail =
  | { kind: 'extraction'; id: string }
  | { kind: 'miner'; id: string }
  | { kind: 'moonOwner'; id: string }
  | { kind: 'statementPeriod'; id: string }
  | null;

/** The moon, Miner, moon owner or Statements period page a pathname names, if any. */
export function moonsDetail(pathname: string): MoonsDetail {
  const match = /^\/corp\/moons\/(extractions|miners|moon-owners|statements)\/([^/]+)\/?$/.exec(
    pathname
  );
  if (!match) return null;
  const id = decodeURIComponent(match[2]);
  if (match[1] === 'extractions') return { kind: 'extraction', id };
  if (match[1] === 'statements') return { kind: 'statementPeriod', id };
  return match[1] === 'miners' ? { kind: 'miner', id } : { kind: 'moonOwner', id };
}

export const extractionPath = (id: string) => `/corp/moons/extractions/${encodeURIComponent(id)}`;
export const minerPath = (id: string) => `/corp/moons/miners/${encodeURIComponent(id)}`;
export const moonOwnerPath = (id: string) => `/corp/moons/moon-owners/${encodeURIComponent(id)}`;
export const statementPeriodPath = (periodStart: string) =>
  `/corp/moons/statements/${encodeURIComponent(periodStart)}`;
