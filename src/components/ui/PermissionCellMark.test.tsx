import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { PermissionCellMark, type PermissionCellMarkProps } from './PermissionCellMark';

const base: PermissionCellMarkProps = {
  status: 'missing',
  character: 'Kestrel',
  permissions: ['Autopilot waypoints'],
  why: 'Sets the route',
  onGrant: () => {},
  onDismiss: () => {},
  settingsLink: <a href="/settings/permissions">Grant missing Permissions</a>,
};

describe('PermissionCellMark', () => {
  it('opens from the keyboard, as a named dialog, without firing the row', async () => {
    const user = userEvent.setup();
    const onRow = vi.fn();
    const onDismiss = vi.fn();
    render(
      <div onClick={onRow}>
        <PermissionCellMark {...base} onDismiss={onDismiss} />
      </div>
    );
    await user.tab();
    expect(
      screen.getByRole('button', { name: 'Kestrel: Autopilot waypoints not granted' })
    ).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(
      await screen.findByRole('dialog', { name: 'Kestrel: grant Autopilot waypoints' })
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: "Don't ask again" }));
    expect(onDismiss).toHaveBeenCalledOnce();
    expect(onRow).not.toHaveBeenCalled();
  });

  it('renders nothing when granted or dismissed', () => {
    const { container, rerender } = render(<PermissionCellMark {...base} status="granted" />);
    expect(container).toBeEmptyDOMElement();
    rerender(<PermissionCellMark {...base} status="dismissed" />);
    expect(container).toBeEmptyDOMElement();
  });
});
