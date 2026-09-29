import type { CsvColumn, CsvTranslate } from '@/lib/csv';

/**
 * One line of Order Detail's "who is cheaper, and where" grid, as exported:
 * the station/system/region scopes plus the player's own order. A scope with
 * no rival (clear, not checked, unreadable structure) carries its state in
 * `seller`, as the grid shows it spanning the figure columns, and no figures.
 */
export interface ScopeOrderCsvRow {
  /** Translated scope name, or the "My order" label. */
  scope: string;
  seller: string;
  price: number | null;
  gapIsk: number | null;
  gapPct: number | null;
  /** "Same station", "3 jumps"… — words on screen, words here. */
  distance: string | null;
}

/** The grid's columns, its combined "ISK · %" gap cell split into two numbers. */
export function scopeOrdersCsvColumns(t: CsvTranslate): CsvColumn<ScopeOrderCsvRow>[] {
  return [
    { header: t('market.orders.scopeColumn'), value: (row) => row.scope },
    { header: t('market.orders.scopeCheapestSeller'), value: (row) => row.seller },
    { header: t('market.orders.scopeTheirPrice'), value: (row) => row.price },
    { header: t('market.orders.scopeOverBy'), value: (row) => row.gapIsk },
    { header: t('market.orders.scopeOverByPct'), value: (row) => row.gapPct },
    { header: t('market.orders.scopeDistance'), value: (row) => row.distance },
  ];
}
