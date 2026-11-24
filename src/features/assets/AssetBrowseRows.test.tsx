import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { ComponentProps } from 'react';
import '@/i18n';
import i18n from '@/i18n';
import { FAILOVER } from '@/features/campaigns/turnInStoryData';
import { withItemActions } from '@/features/market/__fixtures__/itemActions';
import { AssetItemActionsContext, type AssetItemActions } from './assetBrowseModel';
import { BrowseRowView } from './AssetBrowseRows';

const participation = vi.hoisted(() => vi.fn());
vi.mock('@/features/campaigns/useTurnIns', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/campaigns/useTurnIns')>()),
  useParticipation: participation,
}));

const ACTIVE_ID = 7;
const ALT_ID = 8;
const FAILOVER_STACK = { item_id: 501, type_id: FAILOVER.typeId, quantity: 340 };
const TRITANIUM_STACK = { item_id: 502, type_id: 34, quantity: 1_000 };

const actions = {
  priceByTypeId: new Map([
    [FAILOVER.typeId, 55_200],
    [34, 4],
  ]),
  itemValueByItemId: new Map(),
  abyssal: { estimates: new Map(), request: () => () => {}, isAbyssalType: null },
  askEstimateByTypeId: new Map(),
  volumeByTypeId: new Map(),
  materialPlanMap: null,
  onViewInIndustryAsMaterial: vi.fn(),
  stockCostByTypeId: null,
  blueprintTypeIds: null,
  turnInOfferFor: (typeId: number) => (typeId === FAILOVER.typeId ? FAILOVER : null),
} as unknown as AssetItemActions;

function renderStack(asset: typeof FAILOVER_STACK) {
  const props = {
    row: { kind: 'node', key: 'n', node: { kind: 'item', asset } },
    t: i18n.t,
    typeNames: new Map(),
    assetNames: {},
    characterBadges: {
      activeCharacterId: ACTIVE_ID,
      idByItemId: new Map([[asset.item_id, ALT_ID]]),
      nameById: new Map([[ALT_ID, 'Orsa Tellemar']]),
    },
    selectMode: false,
    selectedIds: new Set(),
    onToggleSelection: vi.fn(),
    nodeLabel: () => (asset.type_id === 34 ? 'Tritanium' : 'Shield Failover Report'),
    pathStationId: 60003760,
    pathSegments: [],
    query: '',
  } as unknown as ComponentProps<typeof BrowseRowView>;
  render(
    <MemoryRouter>
      <AssetItemActionsContext.Provider value={actions}>
        {withItemActions(<BrowseRowView {...props} />)}
      </AssetItemActionsContext.Provider>
    </MemoryRouter>
  );
}

describe('Assets turn-in glyph', () => {
  it("opens the turn-in after the stack's value, for the stack's own Character and what the stack turns in", async () => {
    participation.mockReturnValue({ status: 'idle', data: undefined, retry: vi.fn() });
    const user = userEvent.setup();
    renderStack(FAILOVER_STACK);
    // The value stays the market value: a Turn-in Reward never joins it.
    expect(screen.getByText('18.8M')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Turn-in reward for Shield Failover Report' })
    );
    // 340 × 28,000 ISK + 3 full blocks × 4,000 LP × 800 ISK/LP.
    expect(await screen.findByText('You hold 340 · ~19.1M turned in')).toBeInTheDocument();
    expect(participation).toHaveBeenCalledWith(ALT_ID);
  });

  it('draws no glyph on a stack no Campaign Objective takes', () => {
    participation.mockReturnValue({ status: 'idle', data: undefined, retry: vi.fn() });
    renderStack(TRITANIUM_STACK);
    expect(screen.queryByRole('button', { name: /Turn-in reward/ })).not.toBeInTheDocument();
  });
});
