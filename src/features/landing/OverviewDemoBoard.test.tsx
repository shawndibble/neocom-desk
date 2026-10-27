import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { OverviewDemo } from './OverviewDemo';

// The survey chart is a chunk of its own, and the demo holds it back for a moment anyway.
vi.mock('@/features/survey/SurveyCharts', () => ({ SurveyCharts: () => <div /> }));

const board = async () => {
  const demo = within(screen.getByRole('group', { name: /logged-in view/i }));
  await demo.findByRole('region', { name: 'Open orders' });
  return demo;
};

describe('OverviewDemo board', () => {
  it('opens a card menu with the real widget settings, and a choice only closes it', async () => {
    const user = userEvent.setup();
    render(<OverviewDemo />);
    const demo = await board();

    await user.click(demo.getByRole('button', { name: 'Settings for Wallet' }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByText('Range')).toBeInTheDocument();
    expect(within(menu).getByRole('menuitemradio', { name: 'Chart' })).toBeChecked();

    await user.click(within(menu).getByRole('menuitem', { name: 'Duplicate' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    // Nothing was duplicated, and Rename opens no dialog.
    expect(demo.getAllByRole('region', { name: 'Wallet' })).toHaveLength(1);
    await user.click(demo.getByRole('button', { name: 'Settings for Wallet' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Rename' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens the Data updated popover and its Refresh does nothing but exist', async () => {
    const user = userEvent.setup();
    render(<OverviewDemo />);
    const demo = await board();

    await user.click(demo.getByRole('button', { name: /data updated/i }));
    const panel = await screen.findByRole('dialog');
    expect(within(panel).getByRole('row', { name: /training/i })).toBeInTheDocument();
    await user.click(within(panel).getByRole('button', { name: /refresh all/i }));
    expect(demo.getByRole('region', { name: 'Training' })).toBeInTheDocument();
  });

  it('draws titles with their caret but links nowhere', async () => {
    render(<OverviewDemo />);
    const demo = await board();
    expect(demo.queryAllByRole('link')).toHaveLength(0);
  });
});
