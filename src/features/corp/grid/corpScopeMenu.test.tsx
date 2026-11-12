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

function setup(kind: 'corpDeadlines' | 'structures', corporations: number) {
  const widget: WidgetModel = {
    id: 'w1',
    kind,
    size: 'L',
    view: 'table',
    scope: 'all',
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

const ALL = "All characters' corporations";

describe('Corp Board scope choice', () => {
  it.each(['corpDeadlines', 'structures'] as const)(
    'offers %s every corporation, chosen, when two can be read',
    async (kind) => {
      setup(kind, 2);
      await userEvent.click(screen.getByRole('button', { name: /^Settings for / }));
      expect(screen.getByRole('menuitemradio', { name: ALL })).toHaveAttribute(
        'aria-checked',
        'true'
      );
    }
  );

  it.each(['corpDeadlines', 'structures'] as const)(
    'offers %s no choice with one corporation',
    async (kind) => {
      setup(kind, 1);
      await userEvent.click(screen.getByRole('button', { name: /^Settings for / }));
      expect(screen.queryByRole('menuitemradio', { name: ALL })).toBeNull();
    }
  );
});
