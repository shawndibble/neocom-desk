import { describe, it, expect } from 'vitest';

/**
 * Every item-type name rendered in a Mining Tax dialog links to its Market
 * listing (`RowDetailModal.tsx`/`YieldDetailModal.tsx` set the pattern,
 * issue #2158 closed the gap in the rest). A dialog that falls back to
 * bare `typeNames.get(...) ?? \`#${typeId}\`` text loses that link silently,
 * since nothing else marks the omission.
 */
const ALLOWED = new Set<string>([
  // Ledger tables, not action dialogs — issue #2158 scoped the fix to
  // Assign/Join/Split/Group Summary/Type Overrides; these are a separate,
  // wider gap left for a follow-up ticket.
  'src/features/miningTax/OverviewTab.tsx',
  'src/features/miningTax/TaxTab.tsx',
]);

const sources = import.meta.glob<string>(['/src/features/miningTax/**/*.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

const BARE_NAME_FALLBACK = /\?\?\s*`#\$\{[^}]*typeId\}`/;
// `OreLink` is MarketItemLink pointed at the Ore Form's type.
const IMPORTS_MARKET_ITEM_LINK =
  /from\s*'@\/features\/market\/MarketItemLink'|\bOreLink\b[^;]*from\s*'\.\/OreIcon'/;

describe('mining tax type names', () => {
  it('are wrapped in MarketItemLink, not rendered as bare text', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(10);
    const offenders = Object.entries(sources)
      .filter(([path]) => !/\.test\.tsx$/.test(path))
      .filter(
        ([, source]) => BARE_NAME_FALLBACK.test(source) && !IMPORTS_MARKET_ITEM_LINK.test(source)
      )
      .map(([path]) => path.replace(/^\//, ''))
      .filter((path) => !ALLOWED.has(path));
    expect(offenders).toEqual([]);
  });
});
