import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { BiggerChainsPanel } from './BiggerChainsPanel';
import type { BiggerChainsEstimateState, WhatIfChainsState } from './useBiggerChains';
import {
  WHAT_IF_PLANET_ID,
  type BiggerChainEstimates,
  type ColonyChainEstimate,
} from './biggerChainsModel';
import type { PlanetType } from '@/engine/pi/goalTypes';
import type { ChainEstimateView } from './chainEstimateModel';
import type { PlanAdvice } from './planAdviceModel';
import { fixtureAdvice, fixturePi } from './planViewFixture';

let mockState: BiggerChainsEstimateState;
let mockWhatIf: WhatIfChainsState;
const askedFor = vi.fn();
vi.mock('./useBiggerChains', () => ({
  NO_TYPES: [],
  useBiggerChains: () => mockState,
  useWhatIfChains: (_advice: unknown, _pi: unknown, wanted: readonly PlanetType[]) => {
    askedFor([...wanted]);
    return mockWhatIf;
  },
}));

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

beforeEach(() => {
  state(null);
  mockWhatIf = { byType: new Map(), pending: false };
  askedFor.mockClear();
});

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

describe('BiggerChainsPanel: what if I add a planet?', () => {
  const CAMERA_DRONES = 2345;
  // The fixture's colonies are Barren; the chains a Lava planet adds.
  const onBarren = {
    ...advice,
    chainColonies: [{ planetId: 1, planetType: 'barren', ratePerEcu: new Map() }],
  } as unknown as PlanAdvice;
  const withLava: ColonyChainEstimate = {
    typeId: CAMERA_DRONES,
    iskPerDay: 50_000,
    unitsPerDay: 10,
    planetIds: [WHAT_IF_PLANET_ID, 1],
    hostId: 1,
    m3PerWeek: 900,
    legs: [{ from: WHAT_IF_PLANET_ID, to: 1, jumps: null }],
  };

  function renderWith(a: PlanAdvice) {
    return render(
      <MemoryRouter>
        <BiggerChainsPanel advice={a} pi={fixturePi} />
      </MemoryRouter>
    );
  }

  it('lists, per planet type, the Bigger chains it makes possible: planets, haul and an unknown distance', async () => {
    const user = userEvent.setup();
    mockWhatIf = {
      byType: new Map([
        ['lava', new Map([[CAMERA_DRONES, { colonies: withLava, newPlanets: null }]])],
      ]),
      pending: false,
    };
    renderWith(onBarren);
    expect(askedFor).toHaveBeenLastCalledWith(expect.arrayContaining(['lava', 'gas']));
    expect(askedFor.mock.lastCall![0]).not.toContain('barren');
    await user.click(
      screen.getByRole('button', {
        name: /If you add a Lava planet, this Bigger chain becomes possible/,
      })
    );
    const card = screen.getByRole('link', { name: 'Camera Drones' }).closest('li')!;
    expect(card).toHaveTextContent(/on Hek VI and a new Lava planet/);
    expect(card).toHaveTextContent(/a new Lava planet → Hek VI: not known yet/);
    expect(card).toHaveTextContent(/Haul900 m³\/wk/);
    // Hek VI after its rebuild, plus a free slot at the best one-planet recipe for the new planet.
    expect(card).toHaveTextContent(
      /more than these 2 planets earn on their best one-planet picks \(5.9K 5,900 ISK\/day\)/
    );
    expect(within(card).getByText('Est.')).toBeInTheDocument();
  });

  it('waits for the pilot’s own chains before pricing any what-if', () => {
    state(null, { pending: true, candidateCount: 3 });
    renderWith(onBarren);
    expect(askedFor).toHaveBeenLastCalledWith([]);
    expect(screen.getByText(/Pricing what another planet type would add/)).toBeInTheDocument();
  });

  it('prices nothing without a free planet slot, and says why', () => {
    renderWith({ ...onBarren, slots: { ...onBarren.slots, free: 0 } } as PlanAdvice);
    expect(askedFor).toHaveBeenLastCalledWith([]);
    expect(screen.getByText(/no free planet slot/)).toBeInTheDocument();
  });

  it('says so when no planet type would make a Bigger chain possible', () => {
    mockWhatIf = { byType: new Map([['lava', new Map()]]), pending: false };
    renderWith(onBarren);
    expect(screen.getByText(/No planet type you don't run would make/)).toBeInTheDocument();
  });
});
