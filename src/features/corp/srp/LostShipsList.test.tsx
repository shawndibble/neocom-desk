import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { LostShipsList } from './LostShipsList';
import type { LostRow } from './useMemberSrp';

const row: LostRow = {
  killmailId: 1,
  killmailHash: 'a'.repeat(40),
  hullTypeId: 24702,
  classId: 1,
  solarSystemId: 30000142,
  killedAt: Date.UTC(2026, 9, 1),
  kind: 'open',
  ageDays: 3,
  hullName: 'Hurricane',
  systemName: 'Jita',
};

function setup() {
  const onOpen = vi.fn();
  const onFile = vi.fn();
  render(
    <MemoryRouter>
      <LostShipsList rows={[row]} onOpen={onOpen} onFile={onFile} />
    </MemoryRouter>
  );
  return { onOpen, onFile };
}

afterEach(cleanup);

describe('LostShipsList', () => {
  it('opens the killmail when a non-control cell is clicked', async () => {
    const { onOpen, onFile } = setup();
    await userEvent.click(screen.getByText(/\(/));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith(row);
    expect(onFile).not.toHaveBeenCalled();
  });

  it('files without opening when File is clicked', async () => {
    const { onOpen, onFile } = setup();
    await userEvent.click(screen.getByRole('button', { name: /file/i }));
    expect(onFile).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('does not open the killmail when the system link is clicked', async () => {
    const { onOpen } = setup();
    await userEvent.click(screen.getByRole('link', { name: 'Jita' }));
    expect(onOpen).not.toHaveBeenCalled();
  });
});
