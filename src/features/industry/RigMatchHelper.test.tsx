import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { RigMatchHelper } from './RigMatchHelper';

async function openAndType(me: string, te: string, onApply = vi.fn()) {
  const user = userEvent.setup();
  render(<RigMatchHelper facility="azbel" security="nullsec" onApply={onApply} />);
  await user.click(screen.getByRole('button', { name: 'Match from in-game numbers' }));
  await user.type(screen.getByLabelText('Material bonus %'), me);
  await user.type(screen.getByLabelText('Time bonus %'), te);
  return { user, onApply };
}

describe('RigMatchHelper', () => {
  it('applies the fit that makes the typed numbers', async () => {
    // Nullsec: ME II 2.4 x 2.1 = 5.04, TE I 20 x 2.1 = 42.
    const { user, onApply } = await openAndType('5.04', '42');
    await user.click(screen.getByRole('button', { name: 'Use this fit' }));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect([...onApply.mock.calls[0][0]].sort()).toEqual(['meT2', 'none', 'teT1']);
  });

  it('says so when nothing matches, naming the service line to read', async () => {
    await openAndType('3.33', '7');
    expect(
      screen.getByText(/No rig fit gives those numbers.*Manufacturing line/)
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Use this fit' })).toBeNull();
  });
});
