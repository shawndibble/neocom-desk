import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { MobileSortToolbar } from './MobileSortToolbar';

const fields = [
  { id: 'profit', label: 'Profit' },
  { id: 'margin', label: 'Margin' },
] as const;

describe('MobileSortToolbar', () => {
  it('names the direction on the trigger and marks the active menu item', async () => {
    const user = userEvent.setup();
    render(
      <MobileSortToolbar
        count={3}
        fields={fields}
        sort={{ columnId: 'profit', direction: 'desc' }}
        onSortChange={() => {}}
      />
    );
    await user.click(screen.getByRole('button', { name: /^sort by profit, descending$/i }));
    expect(
      screen.getByRole('menuitem', { name: /profit, sorted descending/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Margin' })).toBeInTheDocument();
  });

  it('says ascending when the sort is ascending', () => {
    render(
      <MobileSortToolbar
        count={3}
        fields={fields}
        sort={{ columnId: 'profit', direction: 'asc' }}
        onSortChange={() => {}}
      />
    );
    expect(
      screen.getByRole('button', { name: /^sort by profit, ascending$/i })
    ).toBeInTheDocument();
  });
});
