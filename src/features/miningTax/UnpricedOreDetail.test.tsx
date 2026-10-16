import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import { UnpricedOreDetail } from './UnpricedOreDetail';
import { hasReachableUnpricedHub } from './unpricedHubs';
import type { TradeHub } from '@/market/hubs';

const NAMES = new Map([
  [1, 'Zeolites'],
  [2, 'Veldspar'],
]);
const UNPRICED = new Map<TradeHub['id'], ReadonlySet<number>>([
  ['jita', new Set([1])],
  ['hek', new Set([2])],
]);

describe('UnpricedOreDetail', () => {
  it('keeps the busier-hub advice for a hub that answered with no buy orders', () => {
    render(
      <UnpricedOreDetail unpricedByHub={UNPRICED} unreachableHubs={new Set()} typeNames={NAMES} />
    );
    expect(screen.getByText(/Jita has no buy orders for Zeolites/)).toBeInTheDocument();
    expect(screen.getByText(/Move that payee to a busier hub/)).toBeInTheDocument();
    expect(screen.queryByText(/No price could be loaded/)).not.toBeInTheDocument();
  });

  it('says prices could not be loaded, with no busier-hub advice, when every hub was unreachable', () => {
    render(
      <UnpricedOreDetail
        unpricedByHub={UNPRICED}
        unreachableHubs={new Set(['jita', 'hek'])}
        typeNames={NAMES}
      />
    );
    expect(screen.getByText(/No price could be loaded at Jita for Zeolites/)).toBeInTheDocument();
    expect(screen.getByText(/No price could be loaded at Hek for Veldspar/)).toBeInTheDocument();
    expect(screen.queryByText(/no buy orders/)).not.toBeInTheDocument();
    expect(screen.queryByText(/busier hub/)).not.toBeInTheDocument();
  });

  it('decides per hub when only one was unreachable', () => {
    render(
      <UnpricedOreDetail
        unpricedByHub={UNPRICED}
        unreachableHubs={new Set(['hek'])}
        typeNames={NAMES}
      />
    );
    expect(screen.getByText(/Jita has no buy orders for Zeolites/)).toBeInTheDocument();
    expect(screen.getByText(/No price could be loaded at Hek for Veldspar/)).toBeInTheDocument();
    expect(screen.getByText(/Move that payee to a busier hub/)).toBeInTheDocument();
  });

  it('renders its children after the explanation', () => {
    render(
      <UnpricedOreDetail unpricedByHub={UNPRICED} unreachableHubs={new Set()} typeNames={NAMES}>
        <p>Open the entry</p>
      </UnpricedOreDetail>
    );
    expect(screen.getByText('Open the entry')).toBeInTheDocument();
  });
});

describe('hasReachableUnpricedHub', () => {
  it('is true while any hub with unpriced ore answered, false when all failed', () => {
    expect(hasReachableUnpricedHub(UNPRICED, new Set(['hek']))).toBe(true);
    expect(hasReachableUnpricedHub(UNPRICED, new Set(['jita', 'hek']))).toBe(false);
    expect(hasReachableUnpricedHub(new Map([['jita', new Set<number>()]]), new Set())).toBe(false);
  });
});
