/**
 * Per-item reduction for the Compare drawer's Trade hubs view: which hub has
 * the row's cheapest sell and highest buy. Pure; the hook supplies quotes.
 */
export interface HubQuoteState {
  sell: number | null;
  buy: number | null;
  loading: boolean;
}

export interface HubRowMarks<Id extends string> {
  bestSellHub: Id | null;
  bestBuyHub: Id | null;
}

function bestHub<Id extends string>(
  quotes: Readonly<Record<Id, HubQuoteState>>,
  hubOrder: readonly Id[],
  side: 'sell' | 'buy'
): Id | null {
  let best: Id | null = null;
  let bestValue = 0;
  let quoting = 0;
  for (const id of hubOrder) {
    const quote = quotes[id];
    const value = quote.loading ? null : quote[side];
    if (value === null) continue;
    quoting += 1;
    if (best === null || (side === 'sell' ? value < bestValue : value > bestValue)) {
      best = id;
      bestValue = value;
    }
  }
  // One quote compares nothing, so it earns no mark.
  return quoting >= 2 ? best : null;
}

export function markBestHubs<Id extends string>(
  quotes: Readonly<Record<Id, HubQuoteState>>,
  hubOrder: readonly Id[]
): HubRowMarks<Id> {
  return {
    bestSellHub: bestHub(quotes, hubOrder, 'sell'),
    bestBuyHub: bestHub(quotes, hubOrder, 'buy'),
  };
}
