import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { formatDuration } from '@/lib/duration';
import { fakeItemActions, withItemActions } from '@/features/market/__fixtures__/itemActions';
import type { MarketWideResultRow } from './marketWideOpportunities';
import { MobileMarketWideList } from './MobileMarketWideList';

const row = (
  productTypeID: number,
  productName: string,
  extra: Partial<MarketWideResultRow> = {}
): MarketWideResultRow =>
  ({
    productTypeID,
    productName,
    blueprintTypeID: productTypeID + 1000,
    blueprintSource: 'contract',
    priceCapped: false,
    iskPerHour: 2_000_000,
    buildCost: 5_000_000,
    orderDepth: 'deep',
    marginPct: 18.4,
    seconds: 3600,
    ...extra,
  }) as unknown as MarketWideResultRow;

const rows = [
  row(200, 'Widget Beta', { blueprintSource: 'owned', marginPct: 22.5 }),
  row(300, 'Widget Gamma', { orderDepth: 'thin' }),
];

function renderList(
  props: Partial<Parameters<typeof MobileMarketWideList>[0]> = {},
  onSortChange = vi.fn()
) {
  render(
    <MemoryRouter>
      {withItemActions(
        <MobileMarketWideList
          rows={rows}
          total={812}
          sort={{ columnId: 'iskPerHour', direction: 'desc' }}
          onSortChange={onSortChange}
          blueprintTypeIDFor={() => null}
          skillGateFor={() => undefined}
          nameForSkill={String}
          nameForCharacter={String}
          onStartPlan={() => Promise.resolve(false)}
          {...props}
        />,
        fakeItemActions()
      )}
    </MemoryRouter>
  );
  return onSortChange;
}

const card = (name: string) => screen.getByText(name).closest('li')!;

describe('MobileMarketWideList', () => {
  it('ranks each card and says how much of the scan is shown', () => {
    renderList();
    expect(screen.getByText('Top 2 of 812')).toBeInTheDocument();
    expect(within(card('Widget Beta')).getByText('#1')).toBeInTheDocument();
    expect(within(card('Widget Gamma')).getByText('#2')).toBeInTheDocument();
  });

  it('leads with the sorted field and folds the rest into the quiet line', () => {
    renderList({ sort: { columnId: 'margin', direction: 'desc' } });
    const beta = within(card('Widget Beta'));
    expect(beta.getByTestId('hero')).toHaveTextContent('+22.5%');
    expect(beta.getByTestId('hero')).toHaveTextContent('Margin');
    expect(beta.getByText(`Time: ${formatDuration(3600)}`)).toBeInTheDocument();
    expect(beta.queryByText(/^Margin:/)).not.toBeInTheDocument();
  });

  it('falls back to ISK/hour as the hero for a sort with no figure of its own', () => {
    renderList({ sort: { columnId: 'orderDepth', direction: 'desc' } });
    expect(within(card('Widget Beta')).getByTestId('hero')).toHaveTextContent('ISK/hour');
  });

  it('tags the blueprint source and order depth', () => {
    renderList();
    expect(within(card('Widget Beta')).getByText('Owned')).toBeInTheDocument();
    expect(within(card('Widget Gamma')).getByText('Contract')).toBeInTheDocument();
    expect(within(card('Widget Gamma')).getByText('Thin')).toBeInTheDocument();
  });

  it('re-sorts from the toolbar', async () => {
    const user = userEvent.setup();
    const onSortChange = renderList();
    await user.click(screen.getByRole('button', { name: /Sort by/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Build cost' }));
    expect(onSortChange).toHaveBeenCalledWith({ columnId: 'buildCost', direction: 'asc' });
  });

  it('gives every card its item menu and a Start-a-plan button', () => {
    renderList();
    const beta = within(card('Widget Beta'));
    expect(beta.getByRole('button', { name: 'More actions for Widget Beta' })).toBeInTheDocument();
    expect(beta.getByRole('button', { name: /Start a plan/ })).toBeInTheDocument();
  });
});
