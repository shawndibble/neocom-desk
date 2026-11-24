/**
 * The Appraisal's campaign turn-ins (issue #6706): the facts row's Turn in
 * total opening `TurnInBreakdown`, the Turn in column, the copy menu's Turn in
 * entry split per Item Trader, and the Buy/Sell totals left alone.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { buildAppraisal, type AppraisalItem } from '@/engine/market/appraisal';
import { ZERO_STANDINGS } from '@/engine/market/standings';
import { configureClipboard } from '@/lib/clipboard';
import { DESKTOP_QUERY } from '@/lib/useIsDesktop';
import { TRADE_HUBS } from '@/market/hubs';
import { stubViewport } from '@/test/viewport';
import { FAILOVER, STEREO } from '@/features/campaigns/turnInStoryData';
import type { TurnInOfferDetail, TurnInOffers } from '@/features/campaigns/useTurnIns';
import { AppraisalPanel } from './AppraisalPanel';
import { fakeItemActions, FakeItemActions } from './__fixtures__/itemActions';
import type { AppraisalController } from './useAppraisal';
import type { AppraisalOutcome } from './appraisalData';

const offers = vi.hoisted(() => ({ current: [] as TurnInOfferDetail[] }));
vi.mock('@/features/campaigns/useTurnIns', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/campaigns/useTurnIns')>()),
  useTurnInOffers: () => {
    const byType = new Map(offers.current.map((o) => [o.typeId, o]));
    const data: TurnInOffers = {
      byType,
      offerFor: (typeId) => byType.get(typeId) ?? null,
      fetchedAt: new Date(0),
      fromCache: false,
    };
    return { status: 'ready', data, retry: () => {} };
  },
  useParticipation: () => ({ status: 'idle', data: undefined, retry: () => {} }),
}));
vi.mock('@/app/loginFlow', () => ({ beginEveLogin: vi.fn().mockResolvedValue(undefined) }));

// Sell now 50K each against ~60K turned in: turning in beats selling the reports.
const ITEMS: AppraisalItem[] = [
  {
    typeId: FAILOVER.typeId,
    name: 'Shield Failover Report',
    quantity: 300,
    buy: 50_000,
    sell: 61_000,
  },
  {
    typeId: STEREO.typeId,
    name: 'Stereo-Collapse Signal',
    quantity: 200,
    buy: 50_000,
    sell: 61_000,
  },
  { typeId: 34, name: 'Tritanium', quantity: 1_000, buy: 4, sell: 5 },
];

function controller(overrides: Partial<AppraisalController> = {}): AppraisalController {
  return {
    text: '',
    setText: vi.fn(),
    appraiseText: vi.fn(),
    submitted: '',
    quantityColumn: null,
    chooseQuantityColumn: vi.fn(),
    result: null,
    compare: null,
    loading: false,
    failed: false,
    canAppraise: false,
    appraise: vi.fn(),
    clear: vi.fn(),
    refresh: vi.fn(),
    live: { checking: false, done: 0, total: 0, failed: 0, checkedAt: null },
    compareLive: { checking: false, done: 0, total: 0, failed: 0, checkedAt: null },
    setCompareOpen: vi.fn(),
    settleLive: vi.fn(async () => null),
    ...overrides,
  };
}

const OUTCOME: AppraisalOutcome = {
  appraisal: buildAppraisal(ITEMS, 100),
  unmatched: [],
  implantBonusPct: 0,
  refinesOreOrIce: false,
  accountingLevel: null,
  brokerRelationsLevel: null,
  pricesUnreachable: false,
};

function renderPanel() {
  render(
    <MemoryRouter initialEntries={['/market/appraisal?hub=jita']}>
      <FakeItemActions actions={fakeItemActions()}>
        <AppraisalPanel
          controller={controller({ result: OUTCOME })}
          pricePercent={100}
          onPricePercentChange={vi.fn()}
          hub={TRADE_HUBS[0]}
          onHubChange={vi.fn()}
          onHubPicked={vi.fn()}
          standing={ZERO_STANDINGS}
          characterId={null}
        />
      </FakeItemActions>
    </MemoryRouter>
  );
}

beforeEach(() => {
  stubViewport(DESKTOP_QUERY);
  offers.current = [FAILOVER, STEREO];
});
afterEach(() => {
  cleanup();
  configureClipboard(null);
});

describe('AppraisalPanel — campaign turn-ins (issue #6706)', () => {
  it('shows the Turn in total in the facts row and keeps it out of the Buy and Sell totals', async () => {
    renderPanel();
    // 300 + 200 × 60K = 30M turned in.
    const total = await screen.findByRole('button', { name: /Open the turn-in breakdown/ });
    expect(total).toHaveTextContent('~30M');
    expect(screen.getByText('2 items')).toBeInTheDocument();
    // Buy is 25M + 4,000 sold into the buy orders, never the turn-in.
    expect(screen.getByRole('region', { name: 'Buy' })).toHaveTextContent('25,004,000');
  });

  it('opens TurnInBreakdown from the total, grouped by Item Trader', async () => {
    renderPanel();
    await userEvent.click(
      await screen.findByRole('button', { name: /Open the turn-in breakdown/ })
    );
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Secure Strength Trader');
    expect(dialog).toHaveTextContent('Trail of Silence Trader');
    expect(dialog).toHaveTextContent('+3M over Sell now');
  });

  it('gives each turn-in row a Turn in figure that opens TurnInDetail', async () => {
    renderPanel();
    const table = screen.getByRole('table', { name: 'Appraisal' });
    expect(within(table).getByRole('columnheader', { name: /Turn in/ })).toBeInTheDocument();
    const figure = within(table).getByRole('button', {
      name: /^Turn-in reward for Shield Failover Report/,
    });
    expect(figure).toHaveTextContent('~18M');
    await userEvent.click(figure);
    expect(
      await screen.findByRole('dialog', { name: /Shield Failover Report: turn-in reward/ })
    ).toHaveTextContent('+3M over Sell now');
  });

  it("splits the copy menu's Turn in entry per Item Trader and copies that trader's list", async () => {
    const written: string[] = [];
    configureClipboard(async (text) => {
      written.push(text);
    });
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: /Appraisal/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /^Turn in/ }));
    await userEvent.click(
      await screen.findByRole('menuitem', { name: /^Trail of Silence Trader · / })
    );
    expect(written).toEqual(['Stereo-Collapse Signal\t200']);
  });

  it('shows no Turn in total or column, and a disabled Turn in copy entry, without an Active offer', async () => {
    offers.current = [];
    renderPanel();
    expect(screen.queryByRole('button', { name: /Open the turn-in breakdown/ })).toBeNull();
    const table = screen.getByRole('table', { name: 'Appraisal' });
    expect(within(table).queryByRole('columnheader', { name: /Turn in/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Appraisal/ }));
    await screen.findByRole('menuitem', { name: /^Multibuy/ });
    expect(screen.getByRole('menuitem', { name: /^Turn in/ })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });
});
