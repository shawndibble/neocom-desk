import { describe, expect, it } from 'vitest';
import { markBestHubs, type HubQuoteState } from './compareHubs';

const ORDER = ['jita', 'amarr', 'dodixie'] as const;
type Id = (typeof ORDER)[number];

function quotes(partial: Partial<Record<Id, Partial<HubQuoteState>>>): Record<Id, HubQuoteState> {
  const out = {} as Record<Id, HubQuoteState>;
  for (const id of ORDER) out[id] = { sell: null, buy: null, loading: false, ...partial[id] };
  return out;
}

describe('markBestHubs', () => {
  it('marks the cheapest sell and the highest buy', () => {
    const marks = markBestHubs(
      quotes({
        jita: { sell: 100, buy: 90 },
        amarr: { sell: 95, buy: 92 },
        dodixie: { sell: 110, buy: 80 },
      }),
      ORDER
    );
    expect(marks).toEqual({ bestSellHub: 'amarr', bestBuyHub: 'amarr' });
  });

  it('skips loading hubs and null sides', () => {
    const marks = markBestHubs(
      quotes({
        jita: { sell: 50, buy: 40, loading: true },
        amarr: { sell: 95, buy: null },
        dodixie: { sell: 110, buy: 80 },
      }),
      ORDER
    );
    expect(marks).toEqual({ bestSellHub: 'amarr', bestBuyHub: null });
  });

  it('marks nothing when fewer than two hubs quote a side', () => {
    const marks = markBestHubs(quotes({ jita: { sell: 100, buy: 90 } }), ORDER);
    expect(marks).toEqual({ bestSellHub: null, bestBuyHub: null });
  });

  it('keeps the first hub in order on an exact tie', () => {
    const marks = markBestHubs(
      quotes({ jita: { sell: 100, buy: 5 }, amarr: { sell: 100, buy: 5 } }),
      ['amarr', 'jita', 'dodixie']
    );
    expect(marks).toEqual({ bestSellHub: 'amarr', bestBuyHub: 'amarr' });
  });
});
