import { describe, it, expect } from 'vitest';

const ALLOWED = new Set<string>([
  'src/features/miningTax/OverviewTab.tsx',
  'src/features/miningTax/TaxTab.tsx',
  'src/features/miningTax/useTaxAttentionItems.tsx',
  'src/features/miningTax/useTaxColumns.tsx',
]);

const sources = import.meta.glob<string>(['/src/features/miningTax/**/*.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

const BARE_NAME_FALLBACK = /\?\?\s*`#\$\{[^}]*typeId\}`/;
const IMPORTS_MARKET_ITEM_LINK =
  /from\s*'@\/features\/market\/MarketItemLink'|\bOreLink\b[^;]*from\s*'(?:\.{1,2}\/|@\/features\/miningTax\/)OreIcon'/;

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
