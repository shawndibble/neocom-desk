import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@/i18n';
import { DEFAULT_POP_SHARING } from '../../../../functions/src/popSharing';
import { PopSharingDialog } from './PopSharingDialog';

afterEach(cleanup);

const open = (noAlliance: boolean, audiences = DEFAULT_POP_SHARING.audiences) =>
  render(
    <PopSharingDialog
      title="Sharing default"
      settings={{ ...DEFAULT_POP_SHARING, audiences }}
      communities={[]}
      bookRatePct={10}
      canEdit
      noAlliance={noAlliance}
      onClose={vi.fn()}
      onSave={vi.fn(async () => undefined)}
    />
  );

describe('PopSharingDialog', () => {
  it('offers Alliance while the corporation is in one', () => {
    open(false);
    expect(screen.getByRole('checkbox', { name: 'Alliance' })).toBeEnabled();
    expect(screen.queryByText(/in no alliance/i)).toBeNull();
  });

  it('disables Alliance, saying why, when the corporation is in no alliance', () => {
    open(true);
    expect(screen.getByRole('checkbox', { name: /Alliance/ })).toBeDisabled();
    expect(screen.getByText(/in no alliance/i)).toBeInTheDocument();
  });

  it('still lets an officer untick an Alliance chosen before the corporation left it', () => {
    open(true, [{ kind: 'corp' }, { kind: 'alliance' }]);
    expect(screen.getByRole('checkbox', { name: /Alliance/ })).toBeEnabled();
    expect(screen.getByText(/in no alliance/i)).toBeInTheDocument();
  });
});
