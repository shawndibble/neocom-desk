import { describe, it, expect, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { ESI_BASE_URL } from '@/esi/client';
import { VariationsCompareModal } from './VariationsCompareModal';
import { loadAttributeDictionary } from '@/sde/loadMarketSde';
import { loadSkills } from '@/sde/loadSde';
import { db } from '@/db';
import type { OrderBookSummary } from '@/engine/market/orderBook';

vi.mock('@/sde/loadMarketSde', () => ({
  loadAttributeDictionary: vi.fn(),
}));
vi.mock('@/sde/loadSde', () => ({
  loadSkills: vi.fn(),
  loadTypes: vi.fn(async () => ({})),
  loadPi: vi.fn(async () => ({ schematics: {}, raw: [] })),
}));

const mockedLoadDictionary = vi.mocked(loadAttributeDictionary);
const mockedLoadSkills = vi.mocked(loadSkills);

const ITEMS = [
  { typeId: 587, name: 'Rifter' },
  { typeId: 588, name: 'Republic Fleet Rifter' },
];

function summary(bestSell: number | null): OrderBookSummary {
  return { bestSell, bestBuy: null, spread: null, availableVolume: 0 };
}

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(async () => {
  server.resetHandlers();
  vi.clearAllMocks();
  // Group names cache under the global sentinel; clear so each test's
  // request count is its own.
  await db.esiCache.clear();
});

describe('VariationsCompareModal', () => {
  it('shows a loading state while ESI and the attribute dictionary are in flight', () => {
    server.use(http.get(`${ESI_BASE_URL}/universe/types/:typeId`, () => new Promise(() => {})));
    mockedLoadDictionary.mockReturnValue(new Promise(() => {}));
    mockedLoadSkills.mockReturnValue(new Promise(() => {}));
    render(<VariationsCompareModal items={ITEMS} prices={new Map()} onClose={() => {}} />);
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });

  it('shows a single error state for the modal as a whole when any item fetch fails', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/universe/types/587`, () =>
        HttpResponse.json({
          type_id: 587,
          name: 'Rifter',
          description: '',
          group_id: 25,
          published: true,
        })
      ),
      http.get(`${ESI_BASE_URL}/universe/types/588`, () => HttpResponse.error())
    );
    mockedLoadDictionary.mockResolvedValue({});
    mockedLoadSkills.mockResolvedValue([]);
    render(<VariationsCompareModal items={ITEMS} prices={new Map()} onClose={() => {}} />);
    expect(await screen.findByText("Couldn't load comparison")).toBeInTheDocument();
  });

  it('renders items as columns, the union of attributes as rows, with blank cells for missing attributes', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/universe/types/587`, () =>
        HttpResponse.json({
          type_id: 587,
          name: 'Rifter',
          description: 'flavor text',
          group_id: 25,
          published: true,
          dogma_attributes: [{ attribute_id: 9, value: 1200 }],
        })
      ),
      http.get(`${ESI_BASE_URL}/universe/types/588`, () =>
        HttpResponse.json({
          type_id: 588,
          name: 'Republic Fleet Rifter',
          description: 'other flavor text',
          group_id: 25,
          published: true,
          dogma_attributes: [{ attribute_id: 37, value: 250 }],
        })
      )
    );
    mockedLoadDictionary.mockResolvedValue({
      9: { name: 'Structure Hitpoints', unit: 'HP', category: 'Structure' },
      37: { name: 'Maximum Velocity', unit: 'm/sec', category: 'Speed and Travel' },
    });
    mockedLoadSkills.mockResolvedValue([]);

    render(
      <VariationsCompareModal
        items={ITEMS}
        prices={
          new Map([
            [587, summary(100)],
            [588, summary(200)],
          ])
        }
        onClose={() => {}}
      />
    );

    expect(await screen.findByText('Structure Hitpoints')).toBeInTheDocument();
    expect(screen.getAllByText('Rifter').length).toBeGreaterThan(0);
    expect(screen.getByText('Republic Fleet Rifter')).toBeInTheDocument();
    expect(screen.getByText('Maximum Velocity')).toBeInTheDocument();
    expect(screen.getByText('1,200 HP')).toBeInTheDocument();
    expect(screen.getByText('250 m/sec')).toBeInTheDocument();
    // Neither item's dogma attributes include the other's — one blank cell per row.
    expect(screen.getAllByText('—')).toHaveLength(2);
    // Flavor text is excluded from the matrix.
    expect(screen.queryByText('flavor text')).not.toBeInTheDocument();
  });

  it('shows the Worth section with Estimated Price as the first row, using the passed-in prices', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/universe/types/587`, () =>
        HttpResponse.json({
          type_id: 587,
          name: 'Rifter',
          description: '',
          group_id: 25,
          published: true,
        })
      ),
      http.get(`${ESI_BASE_URL}/universe/types/588`, () =>
        HttpResponse.json({
          type_id: 588,
          name: 'Republic Fleet Rifter',
          description: '',
          group_id: 25,
          published: true,
        })
      )
    );
    mockedLoadDictionary.mockResolvedValue({});
    mockedLoadSkills.mockResolvedValue([]);

    render(
      <VariationsCompareModal
        items={ITEMS}
        prices={new Map([[587, summary(100)]])}
        onClose={() => {}}
      />
    );

    expect(await screen.findByText('Worth')).toBeInTheDocument();
    expect(screen.getByText('Estimated Price')).toBeInTheDocument();
    expect(screen.getByText('100.00')).toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/universe/types/587`, () =>
        HttpResponse.json({
          type_id: 587,
          name: 'Rifter',
          description: '',
          group_id: 25,
          published: true,
        })
      ),
      http.get(`${ESI_BASE_URL}/universe/types/588`, () =>
        HttpResponse.json({
          type_id: 588,
          name: 'Republic Fleet Rifter',
          description: '',
          group_id: 25,
          published: true,
        })
      )
    );
    mockedLoadDictionary.mockResolvedValue({});
    mockedLoadSkills.mockResolvedValue([]);

    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<VariationsCompareModal items={ITEMS} prices={new Map()} onClose={onClose} />);
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
  it('resolves an id-reference row once for the whole matrix, not once per column', async () => {
    let groupCalls = 0;
    const rifter = (typeId: number, name: string) =>
      http.get(`${ESI_BASE_URL}/universe/types/${typeId}`, () =>
        HttpResponse.json({
          type_id: typeId,
          name,
          description: '',
          group_id: 25,
          published: true,
          volume: 27289,
          dogma_attributes: [{ attribute_id: 137, value: 483 }],
        })
      );
    server.use(
      rifter(587, 'Rifter'),
      rifter(588, 'Republic Fleet Rifter'),
      http.get(`${ESI_BASE_URL}/universe/groups/483`, () => {
        groupCalls += 1;
        return HttpResponse.json({
          group_id: 483,
          name: 'Mining Laser',
          category_id: 7,
          published: true,
          types: [],
        });
      })
    );
    mockedLoadDictionary.mockResolvedValue({
      137: { name: 'Used with (Launcher Group)', unit: 'groupID', category: 'Miscellaneous' },
    });
    mockedLoadSkills.mockResolvedValue([]);

    render(<VariationsCompareModal items={ITEMS} prices={new Map()} onClose={() => {}} />);

    expect(await screen.findAllByText('Mining Laser')).toHaveLength(2);
    expect(groupCalls).toBe(1);
  });
});
