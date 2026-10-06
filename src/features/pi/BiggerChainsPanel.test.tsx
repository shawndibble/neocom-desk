import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { BiggerChainsPanel } from './BiggerChainsPanel';
import type { BiggerChainsEstimateState } from './useBiggerChains';
import type { BiggerChainEstimates, ColonyChainEstimate } from './biggerChainsModel';
import type { ChainEstimateView } from './chainEstimateModel';
import type { PlanAdvice } from './planAdviceModel';
import { fixtureAdvice, fixturePi } from './planViewFixture';

let mockState: BiggerChainsEstimateState;
vi.mock('./useBiggerChains', () => ({ useBiggerChains: () => mockState }));

const CONDENSATES = 2344;

const advice = {
  ...fixtureAdvice,
  chainBasis: {
    haulDays: 7,
    books: { prices: {}, revenuePrices: { 2344: 100_000 }, salesTaxPct: 4 },
  },
  chainColonies: [],
} as unknown as PlanAdvice;

function onColonies(iskPerDay: number): ColonyChainEstimate {
  return {
    typeId: CONDENSATES,
    iskPerDay,
    unitsPerDay: 10,
    planetIds: [1, 2],
    hostId: 1,
    m3PerWeek: 700,
    legs: [{ from: 2, to: 1, jumps: null }],
  };
}

const onNew: ChainEstimateView = {
  typeId: CONDENSATES,
  iskPerDay: 9_000_000,
  unitsPerDay: 30,
  planets: ['gas', 'gas'],
  hostType: 'gas',
  m3PerWeek: 1_400,
  m3PerHaul: 1_400,
  haulDays: 7,
  ccLevel: 5,
  ccAssumed: false,
  rateSource: 'measured',
  headsPerExtractor: 10,
  ratePerHour: 6_000,
};

function state(entry: BiggerChainEstimates | null, over: Partial<BiggerChainsEstimateState> = {}) {
  mockState = {
    estimates: new Map(entry ? [[CONDENSATES, entry]] : []),
    candidateCount: entry ? 1 : 0,
    pending: false,
    ...over,
  };
}

function renderPanel() {
  return render(
    <MemoryRouter>
      <BiggerChainsPanel advice={advice} pi={fixturePi} />
    </MemoryRouter>
  );
}

beforeEach(() => state(null));

describe('BiggerChainsPanel', () => {
  it('says so while the chains are still being priced', () => {
    state(null, { pending: true, candidateCount: 3 });
    renderPanel();
    expect(screen.getAllByText(/Pricing the chains your planets can make/).length).toBeGreaterThan(
      0
    );
  });

  it('explains when the pilot’s planet types make no P3 or P4 between them', () => {
    renderPanel();
    expect(screen.getByText(/Your planet types can't make a P3 or P4/)).toBeInTheDocument();
  });

  it('says why a candidate has no figure, never that it lost', () => {
    state({ colonies: null, newPlanets: null });
    renderPanel();
    expect(screen.getByText(/your colonies can't make it in full/)).toBeInTheDocument();
  });

  it('recommends nothing when no chain beats the one-planet picks, and keeps those chains one click away', async () => {
    const user = userEvent.setup();
    // The fixture's colonies earn 5,000 + 1,000 a day after their rebuild.
    state({ colonies: onColonies(4_000), newPlanets: null });
    renderPanel();
    expect(screen.getByText(/The 1 chain your planets can make doesn't beat/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Condensates' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /1 chain that doesn't beat/ }));
    const link = screen.getByRole('link', { name: 'Condensates' });
    const card = link.closest('li')!;
    expect(card).toHaveTextContent(/less than these 2 planets earn on their best one-planet picks/);
    expect(card).toHaveTextContent(/Uttindar II → Hek VI: unknown/);
  });

  it('recommends a chain on new planets of the pilot’s types, with no distance claimed', () => {
    state({ colonies: null, newPlanets: onNew });
    renderPanel();
    const card = screen.getByRole('link', { name: 'Condensates' }).closest('li')!;
    expect(card).toHaveTextContent(
      /on 2 new planets \(2× Gas\), with the factories on the Gas one/
    );
    expect(card).toHaveTextContent(/Uses 2 of your 2 free planet slots/);
    expect(card).toHaveTextContent(/not known yet: the planets are new/);
    expect(card).toHaveTextContent(/more than your best one-planet pick on 2 free slots/);
    expect(within(card).getByText('Est.')).toBeInTheDocument();
  });
});
