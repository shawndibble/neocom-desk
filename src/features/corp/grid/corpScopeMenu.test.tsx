import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import i18n from '@/i18n';
import type { CorpCapabilities } from '@/engine/corpRoles';
import { WidgetBoardContext } from '@/features/overview/widgets/board';
import { CORP_DEFS } from '@/features/overview/widgets/data/corpModels';
import { registerKindDefs } from '@/features/overview/widgets/data/models';
import { OverviewRefreshContext } from '@/features/overview/widgets/data/refreshContext';
import { sampleView } from '@/features/overview/widgets/gallerySamples';
import type { Widget as WidgetModel } from '@/features/overview/widgets/layout';
import { Widget } from '@/features/overview/widgets/Widget';
import { WidgetMenu } from '@/features/overview/widgets/WidgetMenu';
import { corpWidgetBoard } from './corpGrid';

registerKindDefs(CORP_DEFS);

const CAPS = new Proxy({} as CorpCapabilities, { get: () => true });

const ACROSS = [
  'corpDeadlines',
  'structures',
  'moonChunks',
  'corpJobs',
  'corpWallet',
  'corpKills',
  'corpCustomsOffices',
  'corpStarbases',
  'corpSovereignty',
  'corpContracts',
  'corpOrders',
] as const;

function setup(
  kind: (typeof ACROSS)[number],
  corporations: number,
  scope: WidgetModel['scope'] = 'all'
) {
  const widget: WidgetModel = {
    id: 'w1',
    kind,
    size: 'L',
    view: 'table',
    scope,
    showOnPhone: true,
  };
  render(
    <MemoryRouter>
      <WidgetBoardContext.Provider value={corpWidgetBoard(CAPS, () => corporations)}>
        <OverviewRefreshContext.Provider value={{ epoch: 0, refresh: vi.fn() }}>
          <Widget
            widget={widget}
            previewView={sampleView(kind, i18n.t.bind(i18n))!}
            menu={(card, target) => (
              <WidgetMenu widget={widget} to={target}>
                {card}
              </WidgetMenu>
            )}
          />
        </OverviewRefreshContext.Provider>
      </WidgetBoardContext.Provider>
    </MemoryRouter>
  );
}

const ALL = 'All my corporations';

describe('Corp Board scope choice', () => {
  it.each(ACROSS)('offers %s every corporation, chosen, when two can be read', async (kind) => {
    setup(kind, 2);
    await userEvent.click(screen.getByRole('button', { name: /^Settings for / }));
    expect(screen.getByRole('menuitemradio', { name: ALL })).toHaveAttribute(
      'aria-checked',
      'true'
    );
  });

  it.each(ACROSS)('offers %s no choice with one corporation', async (kind) => {
    setup(kind, 1);
    await userEvent.click(screen.getByRole('button', { name: /^Settings for / }));
    expect(screen.queryByRole('menuitemradio', { name: ALL })).toBeNull();
  });

  it('offers the corp wallet Divisions only on All, and says why', async () => {
    setup('corpWallet', 2);
    await userEvent.click(screen.getByRole('button', { name: /^Settings for / }));
    expect(screen.getByRole('menuitemradio', { name: 'Divisions' })).not.toHaveAttribute(
      'aria-disabled',
      'true'
    );
    for (const name of ['Flow', 'Sources']) {
      expect(screen.getByRole('menuitemradio', { name })).toHaveAttribute('aria-disabled', 'true');
    }
    expect(
      screen.getByText('Flow and Sources read one corporation: pick This corporation for them.')
    ).toBeInTheDocument();
  });

  it('offers the corp wallet every Show on its own corporation', async () => {
    setup('corpWallet', 2, 'header');
    await userEvent.click(screen.getByRole('button', { name: /^Settings for / }));
    for (const name of ['Flow', 'Sources']) {
      expect(screen.getByRole('menuitemradio', { name })).not.toHaveAttribute(
        'aria-disabled',
        'true'
      );
    }
  });
});
