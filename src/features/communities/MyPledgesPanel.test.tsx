import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { MyPledgeRow } from '@/engine/communities/requests';
import { MyPledgesPanel } from './MyPledgesPanel';

const row = (over: Partial<MyPledgeRow> = {}): MyPledgeRow => ({
  request: {
    id: 'r1',
    ownerUid: 'char:2',
    ownerName: 'Bo Tanner',
    location: '',
    terms: '',
    lines: [{ typeId: 34, name: 'Tritanium', quantity: 1000, kind: 'item' }],
    createdAt: 1,
    lastActivityAt: 1,
    expiresAt: 2,
    closed: false,
    notify: { app: true, mail: false },
  },
  index: 0,
  line: { typeId: 34, name: 'Tritanium', quantity: 1000, kind: 'item' },
  entry: { quantity: 600, delivered: 250, contractIds: [] },
  updatedAt: 1,
  stale: false,
  ...over,
});

const renderPanel = (rows: MyPledgeRow[], onOpenRequest = vi.fn()) => {
  render(
    <MyPledgesPanel
      open
      rows={rows}
      communityName="Pals"
      onClose={vi.fn()}
      onOpenRequest={onOpenRequest}
    />
  );
  return onOpenRequest;
};

describe('MyPledgesPanel', () => {
  it('lists each Pledge with what is pledged and delivered, and opens its Request', async () => {
    const user = userEvent.setup();
    const onOpen = renderPanel([row()]);
    expect(screen.getByText('Tritanium')).toBeInTheDocument();
    expect(screen.getByText(/600/)).toHaveTextContent(/250/);
    await user.click(screen.getByRole('button', { name: /Bo Tanner \(Tritanium\)/ }));
    expect(onOpen).toHaveBeenCalledWith('r1');
  });

  it('greys a stale Pledge and says why', () => {
    renderPanel([row({ stale: true })]);
    expect(screen.getByText(/14 days/)).toBeInTheDocument();
  });

  it('shows the empty state', () => {
    renderPanel([]);
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});
