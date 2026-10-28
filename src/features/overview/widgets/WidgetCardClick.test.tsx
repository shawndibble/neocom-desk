import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import i18n from '@/i18n';
import { OverviewRefreshContext } from './data/refreshContext';
import { sampleView } from './gallerySamples';
import type { Widget as WidgetModel } from './layout';
import { Widget } from './Widget';
import { WidgetMenu } from './WidgetMenu';

const widget: WidgetModel = {
  id: 'w1',
  kind: 'mail',
  size: 'M',
  view: 'number',
  scope: 'header',
  showOnPhone: true,
};

function Where() {
  return <output data-testid="where">{useLocation().pathname}</output>;
}

function setup({ to = '/mail', editing = false }: { to?: string | null; editing?: boolean } = {}) {
  const view = { ...sampleView('mail', i18n.t.bind(i18n))!, to };
  render(
    <MemoryRouter>
      <OverviewRefreshContext.Provider value={{ epoch: 0, refresh: vi.fn() }}>
        <Widget
          widget={widget}
          editing={editing}
          previewView={view}
          onRemove={() => undefined}
          menu={(card, target) => (
            <WidgetMenu widget={widget} to={target}>
              {card}
            </WidgetMenu>
          )}
        />
        <Where />
      </OverviewRefreshContext.Provider>
    </MemoryRouter>
  );
  return screen.getByRole('region', { name: 'Mail' });
}

const itemTexts = (menu: HTMLElement) =>
  [...menu.querySelectorAll('[role^="menuitem"]')].map((item) => item.textContent ?? '');

const where = () => screen.getByTestId('where').textContent;

describe('Overview widget card', () => {
  it('goes to the widget page on a click in plain card space', async () => {
    const card = setup();
    await userEvent.click(card);
    expect(where()).toBe('/mail');
  });

  it('does not go anywhere on a click on a button inside the card', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Settings for Mail' }));
    expect(where()).toBe('/');
  });

  it('does not go anywhere while customizing', async () => {
    const card = setup({ editing: true });
    await userEvent.click(card);
    expect(where()).toBe('/');
  });

  it('does not go anywhere for a kind with no page', async () => {
    const card = setup({ to: null });
    await userEvent.click(card);
    expect(where()).toBe('/');
    expect(card.className).not.toContain('cursor-pointer');
  });

  it('opens Open page first on a right-click, then the ⋮ items', async () => {
    const card = setup();
    fireEvent.contextMenu(card);
    const menu = await screen.findByRole('menu');
    const names = itemTexts(menu);
    expect(names[0]).toBe('Open Mail page');
    expect(names).toContain('Rename');
    expect(where()).toBe('/');
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Open Mail page' }));
    expect(where()).toBe('/mail');
  });

  it('puts Open in new tab right after Open page, linking to the same page', async () => {
    const card = setup();
    fireEvent.contextMenu(card);
    const menu = await screen.findByRole('menu');
    expect(itemTexts(menu).slice(0, 2)).toEqual(['Open Mail page', 'Open in new tab']);
    const link = within(menu).getByRole('menuitem', { name: 'Open in new tab' });
    expect(link).toHaveAttribute('href', '/mail');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('leaves out Open in new tab for a kind with no page', async () => {
    const card = setup({ to: null });
    fireEvent.contextMenu(card);
    const menu = await screen.findByRole('menu');
    expect(within(menu).queryByRole('menuitem', { name: 'Open in new tab' })).toBeNull();
  });

  it('shows the right-click items in the ⋮ menu too', async () => {
    const card = setup();
    fireEvent.contextMenu(card);
    const right = itemTexts(await screen.findByRole('menu'));
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Settings for Mail' }));
    const more = itemTexts(await screen.findByRole('menu'));
    expect(more).toEqual(right);
  });

  it('leaves out Open page for a kind with no page', async () => {
    const card = setup({ to: null });
    fireEvent.contextMenu(card);
    const menu = await screen.findByRole('menu');
    expect(within(menu).queryByRole('menuitem', { name: /^Open/ })).not.toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Rename' })).toBeInTheDocument();
  });
});
