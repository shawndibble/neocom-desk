import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { FeatureShowcase } from './FeatureShowcase';
import { SHOWCASE_TABS } from './showcaseTabs';

describe('FeatureShowcase', () => {
  it('opens on the first area with its screenshot and what it does', () => {
    render(<FeatureShowcase />);
    expect(screen.getByRole('tab', { name: 'Industry', selected: true })).toBeInTheDocument();
    const panel = within(screen.getByRole('tabpanel'));
    expect(panel.getByRole('img', { name: /a build plan for an orca/i })).toHaveAttribute(
      'src',
      '/screenshots/desktop-build-plan.webp'
    );
    expect(panel.getByText(/costs materials, job cost and taxes/i)).toBeInTheDocument();
  });

  it('switches the screenshot and the bullets with the tab', async () => {
    render(<FeatureShowcase />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('tab', { name: 'Corporation' }));
    const panel = within(screen.getByRole('tabpanel'));
    expect(panel.getByRole('img', { name: /corporation overview/i })).toHaveAttribute(
      'src',
      '/screenshots/desktop-corporation.webp'
    );
    expect(panel.getByText(/merges fuel, structure timers/i)).toBeInTheDocument();
    expect(panel.queryByRole('img', { name: /a build plan for an orca/i })).toBeNull();
    expect(panel.queryByText(/costs materials, job cost and taxes/i)).toBeNull();
  });

  it('overlays the phone capture on the areas that have one, and only there', async () => {
    render(<FeatureShowcase />);
    const user = userEvent.setup();
    expect(screen.queryByRole('img', { name: /on a phone/i })).toBeNull();
    await user.click(screen.getByRole('tab', { name: 'Market & orders' }));
    expect(
      within(screen.getByRole('tabpanel')).getByRole('img', {
        name: /market order book on a phone/i,
      })
    ).toHaveAttribute('src', '/screenshots/phone-market-jumps.webp');
  });

  it('enlarges a screenshot in a dialog and closes it again', async () => {
    render(<FeatureShowcase />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /enlarge: a build plan for an orca/i }));
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByRole('img', { name: /a build plan for an orca/i })
    ).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('moves between tabs with the arrow keys', async () => {
    render(<FeatureShowcase />);
    const user = userEvent.setup();
    screen.getByRole('tab', { name: 'Industry' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(
      screen.getByRole('tab', { name: 'Market & orders', selected: true })
    ).toBeInTheDocument();
  });

  it('gives every tab at least three bullets with real copy', async () => {
    render(<FeatureShowcase />);
    const user = userEvent.setup();
    for (const { id, bullets } of SHOWCASE_TABS) {
      expect(bullets.length).toBeGreaterThanOrEqual(3);
      expect(bullets.length).toBeLessThanOrEqual(4);
      const tabs = screen.getAllByRole('tab');
      await user.click(tabs[SHOWCASE_TABS.findIndex((tab) => tab.id === id)]);
      // i18next prints a missing key as the key itself.
      expect(screen.getByRole('tabpanel').textContent).not.toMatch(/login\.showcase/);
    }
  });
});
