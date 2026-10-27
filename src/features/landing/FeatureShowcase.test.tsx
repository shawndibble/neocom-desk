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
    expect(panel.getByRole('img', { name: /running and finished jobs/i })).toHaveAttribute(
      'src',
      '/screenshots/desktop-industry-jobs.webp'
    );
    expect(panel.getByText(/costs materials, job cost and taxes/i)).toBeInTheDocument();
  });

  it('switches the screenshot and the bullets with the tab', async () => {
    render(<FeatureShowcase />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('tab', { name: 'Corporation' }));
    const panel = within(screen.getByRole('tabpanel'));
    expect(panel.getByRole('img', { name: /Corp Board/i })).toHaveAttribute(
      'src',
      '/screenshots/desktop-corporation.webp'
    );
    expect(panel.getByText(/a board of widgets you pick and size/i)).toBeInTheDocument();
    expect(panel.queryByRole('img', { name: /running and finished jobs/i })).toBeNull();
    expect(panel.queryByText(/costs materials, job cost and taxes/i)).toBeNull();
  });

  it('lists only what a tab adds under "Also includes", never its own name', async () => {
    render(<FeatureShowcase />);
    const user = userEvent.setup();
    expect(screen.queryByText('Also includes')).toBeNull();
    await user.click(screen.getByRole('tab', { name: 'Alerts' }));
    const panel = within(screen.getByRole('tabpanel'));
    expect(panel.getByText('Also includes')).toBeInTheDocument();
    expect(panel.getByText('Notifications')).toBeInTheDocument();
    expect(panel.queryByText('Alerts')).toBeNull();
  });

  it('enlarges a screenshot in a dialog and closes it again', async () => {
    render(<FeatureShowcase />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /enlarge: the industry page/i }));
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByRole('img', { name: /running and finished jobs/i })
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
