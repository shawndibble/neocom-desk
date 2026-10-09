import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StatusPill } from './StatusPill';

describe('StatusPill', () => {
  it.each(['unassigned', 'needs-review', 'outstanding', 'paid', 'dismissed'] as const)(
    'draws %s as a word with no border (§6c: no box on static content)',
    (status) => {
      render(<StatusPill status={status} label="Label" />);
      expect(screen.getByText('Label').className).not.toMatch(/\bborder/);
    }
  );

  it('explains itself on focus when given a hint, and has no tooltip trigger otherwise', async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <StatusPill status="needs-review" label="Needs Review" hint="It grew." />
    );
    await user.tab();
    expect(await screen.findByText('It grew.')).toBeInTheDocument();
    unmount();
    render(<StatusPill status="paid" label="Paid" />);
    expect(screen.getByText('Paid').closest('[tabindex]')).toBeNull();
  });
});
