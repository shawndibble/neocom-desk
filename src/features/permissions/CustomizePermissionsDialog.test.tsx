import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import { beginCustomizedAddCharacterLogin } from '@/app/loginFlow';
import { DEFAULT_ON_GROUPS } from '@/esi/scopes';
import { CustomizePermissionsDialog } from './CustomizePermissionsDialog';
import { CUSTOMIZE_SELECTION_KEY, useCustomizePermissionsSelection } from './customizeSelection';

vi.mock('@/app/loginFlow', () => ({
  beginCustomizedAddCharacterLogin: vi.fn().mockResolvedValue(undefined),
}));

const mockedLogin = vi.mocked(beginCustomizedAddCharacterLogin);

beforeEach(async () => {
  vi.clearAllMocks();
  await db.settings.clear();
  // The store is module-scoped and `hydrate()` is a no-op once `hydrated` is
  // true, so without this reset a later test would start from whatever an
  // earlier test last applied in memory rather than from the cleared table.
  useCustomizePermissionsSelection.setState({ value: DEFAULT_ON_GROUPS, hydrated: false });
});

describe('CustomizePermissionsDialog', () => {
  it('shows both Core Grant rows checked and disabled', async () => {
    render(<CustomizePermissionsDialog open onClose={vi.fn()} />);
    for (const name of [/skills & skill queue/i, /structure lookup/i]) {
      const checkbox = await screen.findByRole('checkbox', { name });
      expect(checkbox).toBeChecked();
      expect(checkbox).toBeDisabled();
    }
  });

  it('starts every default-on Permission checked and the two opt-in ones unchecked', async () => {
    render(<CustomizePermissionsDialog open onClose={vi.fn()} />);
    expect(await screen.findByRole('checkbox', { name: 'Wallet' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Corporation' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Structure markets' })).not.toBeChecked();
    expect(screen.getByText(`Optional · ${DEFAULT_ON_GROUPS.length} of 14`)).toBeInTheDocument();
  });

  it('tags Corporation and Structure markets as opt-in', async () => {
    render(<CustomizePermissionsDialog open onClose={vi.fn()} />);
    await screen.findByRole('checkbox', { name: 'Wallet' });
    expect(screen.getAllByText('Opt-in')).toHaveLength(2);
  });

  it('unchecking a Permission updates the count and the submitted request', async () => {
    const user = userEvent.setup();
    render(<CustomizePermissionsDialog open onClose={vi.fn()} />);
    await user.click(await screen.findByRole('checkbox', { name: 'Wallet' }));
    expect(
      screen.getByText(`Optional · ${DEFAULT_ON_GROUPS.length - 1} of 14`)
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /log in with selected permissions/i }));
    await waitFor(() => expect(mockedLogin).toHaveBeenCalledTimes(1));
    expect(mockedLogin.mock.calls[0][0]).not.toContain('wallet');
  });

  it('Select all checks every one of the 14, opt-in included', async () => {
    const user = userEvent.setup();
    render(<CustomizePermissionsDialog open onClose={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: 'Select all' }));
    expect(screen.getByRole('checkbox', { name: 'Corporation' })).toBeChecked();
    expect(screen.getByText('Optional · 14 of 14')).toBeInTheDocument();
  });

  it('Select none unchecks every Permission, leaving the Core Grant alone', async () => {
    const user = userEvent.setup();
    render(<CustomizePermissionsDialog open onClose={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: 'Select none' }));
    expect(screen.getByText('Optional · 0 of 14')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /skills & skill queue/i })).toBeChecked();
  });

  it('Cancel closes without persisting or logging in', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<CustomizePermissionsDialog open onClose={onClose} />);
    await user.click(await screen.findByRole('checkbox', { name: 'Wallet' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockedLogin).not.toHaveBeenCalled();
    expect(await db.settings.get(CUSTOMIZE_SELECTION_KEY)).toBeUndefined();
  });

  it('starts from a selection stored on a previous visit (AC: survives a reload)', async () => {
    await db.settings.put({ key: CUSTOMIZE_SELECTION_KEY, value: ['mail'] });

    render(<CustomizePermissionsDialog open onClose={vi.fn()} />);

    expect(await screen.findByRole('checkbox', { name: 'Mail' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Wallet' })).not.toBeChecked();
    expect(screen.getByText('Optional · 1 of 14')).toBeInTheDocument();
  });

  it('disables every Permission checkbox and Submit until hydration resolves, so a fast click can’t fork from the pre-hydration default', async () => {
    const realHydrate = useCustomizePermissionsSelection.getState().hydrate;
    // Stored selection is Mail only, but `hydrate` never resolves during the
    // first half of this test — the store stays `hydrated: false` on
    // purpose, to prove the UI stays locked rather than racing ahead on the
    // pre-hydration `DEFAULT_ON_GROUPS`.
    useCustomizePermissionsSelection.setState({
      value: ['mail'],
      hydrated: false,
      hydrate: () => new Promise<void>(() => {}),
    });

    render(<CustomizePermissionsDialog open onClose={vi.fn()} />);
    const wallet = await screen.findByRole('checkbox', { name: 'Wallet' });
    expect(wallet).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /log in with selected permissions/i })
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Select all' })).toBeDisabled();

    // Hydration lands.
    useCustomizePermissionsSelection.setState({ hydrated: true, hydrate: realHydrate });
    await waitFor(() => expect(wallet).not.toBeDisabled());
    expect(screen.getByRole('checkbox', { name: 'Mail' })).toBeChecked();
    expect(wallet).not.toBeChecked();
  });

  it('still logs in even when persisting the selection fails (quota, private browsing)', async () => {
    const setValue = vi
      .spyOn(useCustomizePermissionsSelection.getState(), 'setValue')
      .mockRejectedValue(new Error('quota exceeded'));
    const user = userEvent.setup();
    render(<CustomizePermissionsDialog open onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /log in with selected permissions/i }));

    await waitFor(() => expect(mockedLogin).toHaveBeenCalledTimes(1));
    setValue.mockRestore();
  });

  it('remembers the submitted selection for the next open', async () => {
    const user = userEvent.setup();
    render(<CustomizePermissionsDialog open onClose={vi.fn()} />);
    await user.click(await screen.findByRole('checkbox', { name: 'Wallet' }));
    await user.click(screen.getByRole('button', { name: /log in with selected permissions/i }));
    await waitFor(() => expect(mockedLogin).toHaveBeenCalledTimes(1));

    const stored = await db.settings.get(CUSTOMIZE_SELECTION_KEY);
    expect(stored?.value).not.toContain('wallet');
  });
});
