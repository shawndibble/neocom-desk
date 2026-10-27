import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { fakeItemActions, withItemActions } from '@/features/market/__fixtures__/itemActions';
import type { OpportunityRow } from './opportunities';
import { MobileOpportunityList } from './MobileOpportunityList';

const catalogEntry = {
  blueprintTypeID: 900,
  blueprint: { activity: 'manufacturing', skills: [] },
  productTypeID: 1000,
  productName: 'Widget Alpha',
  productNameLower: 'widget alpha',
};

const row = {
  candidate: {
    id: '91:1',
    characterId: 91,
    characterName: 'Pilot One',
    blueprint: { item_id: 1, type_id: 900, runs: -1 },
    catalogEntry,
  },
  result: {
    seconds: 60,
    materials: [],
    iskPerHour: null,
    marginPct: null,
    profit: null,
    totalCost: 0,
    revenue: null,
  },
  orderDepth: 'deep',
} as unknown as OpportunityRow;

describe('MobileOpportunityList', () => {
  it('the product name is a button that starts the plan once (keyboard reachable)', async () => {
    const user = userEvent.setup();
    const onStartPlan = vi.fn(() => Promise.resolve(false));
    render(
      withItemActions(
        <MobileOpportunityList
          rows={[row]}
          showCharacterColumn={false}
          selectedIds={new Set()}
          onToggleSelected={() => {}}
          onClearSelected={() => {}}
          onCompare={() => {}}
          onStartPlan={onStartPlan}
          onViewHistory={() => {}}
          skillGateFor={() => undefined}
          nameForSkill={(id) => String(id)}
          nameForCharacter={(id) => String(id)}
        />,
        fakeItemActions()
      ),
      { wrapper: MemoryRouter }
    );
    const name = screen.getByRole('button', { name: 'Widget Alpha' });
    name.focus();
    await user.keyboard('{Enter}');
    expect(onStartPlan).toHaveBeenCalledTimes(1);
    expect(onStartPlan).toHaveBeenCalledWith(catalogEntry);
  });
});
