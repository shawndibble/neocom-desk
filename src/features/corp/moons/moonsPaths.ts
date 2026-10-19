/**
 * `/corp/moons`'s URLs (ADR 0015): the tab is a path segment, and the two
 * drill-down pages live below their tab (`PageTab.deep`), so the page stays
 * mounted and Back returns to the table.
 */
import { definePageTabs } from '@/lib/pageTabs';

export const MOONS_TABS = definePageTabs('/corp/moons', [
  { id: 'extractions', labelKey: 'corpTaxBook.moons.tabs.extractions', deep: true },
  { id: 'miners', labelKey: 'corpTaxBook.moons.tabs.miners', deep: true },
  { id: 'statements', labelKey: 'corpTaxBook.moons.tabs.statements' },
]);

export type MoonsDetail = { kind: 'extraction'; id: string } | { kind: 'miner'; id: string } | null;

/** The moon or Miner page a pathname names, if any. */
export function moonsDetail(pathname: string): MoonsDetail {
  const match = /^\/corp\/moons\/(extractions|miners)\/([^/]+)\/?$/.exec(pathname);
  if (!match) return null;
  const id = decodeURIComponent(match[2]);
  return match[1] === 'extractions' ? { kind: 'extraction', id } : { kind: 'miner', id };
}

export const extractionPath = (id: string) => `/corp/moons/extractions/${encodeURIComponent(id)}`;
export const minerPath = (id: string) => `/corp/moons/miners/${encodeURIComponent(id)}`;
