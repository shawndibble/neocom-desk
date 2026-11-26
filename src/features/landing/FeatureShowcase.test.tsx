import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { FeatureShowcase } from './FeatureShowcase';
import { SHOWCASE_TABS } from './showcaseTabs';

describe('FeatureShowcase', () => {
  it('opens on Trade with its screenshot, three questions and its pages', () => {
    render(<FeatureShowcase />);
    expect(screen.getByRole('tab', { name: 'Trade', selected: true })).toBeInTheDocument();
    const panel = within(screen.getByRole('tabpanel'));
    expect(panel.getByRole('img', { name: /the market page/i })).toHaveAttribute(
      'src',
      '/screenshots/desktop-market.webp'
    );
    expect(panel.getAllByRole('heading', { level: 3 })).toHaveLength(3);
    expect(
      panel.getByRole('heading', { name: /cheapest one without crossing lowsec/i })
    ).toBeInTheDocument();
    for (const page of ['Market', 'Open Orders', 'Wallet', 'Assets', 'Contracts']) {
      expect(panel.getByText(page)).toBeInTheDocument();
    }
  });

  it('switches the screenshot, the questions and the pages with the tab', async () => {
    render(<FeatureShowcase />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('tab', { name: 'Run a corp' }));
    const panel = within(screen.getByRole('tabpanel'));
    expect(panel.getByRole('img', { name: /Corp Board/i })).toHaveAttribute(
      'src',
      '/screenshots/desktop-corporation.webp'
    );
    expect(panel.getByRole('heading', { name: /who owes moon tax/i })).toBeInTheDocument();
    expect(panel.getByText('Corp Tax Book')).toBeInTheDocument();
    expect(panel.getByText('Communities')).toBeInTheDocument();
    expect(panel.queryByRole('heading', { name: /cheapest one/i })).toBeNull();
  });

  it('enlarges a screenshot in a dialog and closes it again', async () => {
    render(<FeatureShowcase />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /enlarge: the market page/i }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('img', { name: /the market page/i })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('moves between tabs with the arrow keys', async () => {
    render(<FeatureShowcase />);
    const user = userEvent.setup();
    screen.getByRole('tab', { name: 'Trade' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Build', selected: true })).toBeInTheDocument();
  });

  it('gives every tab three questions with real copy', async () => {
    render(<FeatureShowcase />);
    const user = userEvent.setup();
    for (const [index, { items }] of SHOWCASE_TABS.entries()) {
      expect(items).toHaveLength(3);
      await user.click(screen.getAllByRole('tab')[index]);
      expect(screen.getByRole('tabpanel').textContent).not.toMatch(/login\.showcase/);
    }
  });
});

describe('FeatureShowcase tour videos', () => {
  it('puts each walkthrough on the area it explains, under its short label', async () => {
    render(<FeatureShowcase />);
    const user = userEvent.setup();
    const watch: Record<string, string[]> = {
      Trade: ['Watch a full evening'],
      Build: ['Watch an industry build, start to sale'],
      Fly: ['Watch a skill queue get optimised', 'Watch a fit go from paste to undock'],
      'Run a corp': ['Watch the officer pages'],
      'Stay in touch': [],
    };
    for (const [tab, labels] of Object.entries(watch)) {
      await user.click(screen.getByRole('tab', { name: tab }));
      const panel = within(screen.getByRole('tabpanel'));
      expect(panel.queryAllByRole('button', { name: /^Watch/ })).toHaveLength(labels.length);
      for (const label of labels) {
        expect(panel.getByRole('button', { name: label })).toBeInTheDocument();
      }
    }
  });

  it('plays a walkthrough in a dialog titled with the full video name', async () => {
    render(<FeatureShowcase />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('tab', { name: 'Fly' }));
    await user.click(screen.getByRole('button', { name: 'Watch a skill queue get optimised' }));
    expect(
      await screen.findByRole('dialog', {
        name: 'Plan Your EVE Online Skills: A Faster Queue, Remaps, Accelerators and Masteries',
      })
    ).toBeInTheDocument();
  });
});
