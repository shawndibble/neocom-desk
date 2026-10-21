import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { MoonOwnerDetail } from '@/engine/corpTaxBook/moonOwners';
import { RemoveMoonOwnerDialog } from './MoonOwnerDialogs';
import { MoonOwnerPage } from './MoonOwnerPage';

const detail = (over: Partial<MoonOwnerDetail> = {}): MoonOwnerDetail => ({
  row: {
    id: '98',
    corporationId: 98,
    status: 'active',
    refineryCount: 1,
    mined: 0,
    owed: 0,
    balance: { kind: 'none', isk: 0 },
    mode: 'normal',
  },
  joinedAt: Date.UTC(2026, 8, 28),
  history: [],
  payouts: [],
  accrued: 0,
  paid: 0,
  mined: [],
  hasPayee: true,
  payee: { kind: 'corporation', id: 98 },
  ...over,
});

const pending = (over: Partial<NonNullable<MoonOwnerDetail['removal']>> = {}): MoonOwnerDetail =>
  detail({
    row: { ...detail().row, status: 'removal-pending' },
    removal: {
      startedAt: Date.UTC(2026, 9, 17, 14, 22),
      startedByName: 'Kestrel Vane',
      effectiveAt: Date.UTC(2026, 9, 18, 14, 22),
      ...over,
    },
  });

function page(d: MoonOwnerDetail, props: Partial<Parameters<typeof MoonOwnerPage>[0]> = {}) {
  return render(
    <MemoryRouter>
      <MoonOwnerPage
        detail={d}
        name="Ostrava Salvage"
        characterName={() => 'x'}
        refineryName={() => 'r'}
        oreName={() => 'o'}
        backTo="/corp/moons/moon-owners"
        {...props}
      />
    </MemoryRouter>
  );
}

describe('the removal strip', () => {
  it('says when it takes effect and who started it', () => {
    page(pending());
    expect(screen.getByRole('status')).toHaveTextContent(
      'Removal pending, takes effect 18 Oct 2026 14:22 EVE time'
    );
    expect(screen.getByRole('status')).toHaveTextContent('Started by Kestrel Vane');
  });

  it('offers Cancel removal to an officer who may edit, and runs it', async () => {
    const onCancelRemoval = vi.fn().mockResolvedValue(undefined);
    page(pending(), { onCancelRemoval });
    await userEvent.click(screen.getByRole('button', { name: 'Cancel removal' }));
    expect(onCancelRemoval).toHaveBeenCalledOnce();
  });

  it('offers nothing to a viewer who may not edit', () => {
    page(pending());
    expect(screen.queryByRole('button', { name: 'Cancel removal' })).toBeNull();
  });

  it('shows no time until the notice is out, and offers to record one sent by hand', async () => {
    const onNoticeSent = vi.fn().mockResolvedValue(undefined);
    page(pending({ effectiveAt: undefined }), { onNoticeSent });
    expect(screen.getByRole('status')).toHaveTextContent('Removal pending');
    expect(screen.getByRole('status')).not.toHaveTextContent('takes effect');
    await userEvent.click(screen.getByRole('button', { name: 'I sent the notice' }));
    expect(onNoticeSent).toHaveBeenCalledOnce();
  });

  it('says so when cancelling fails', async () => {
    page(pending(), { onCancelRemoval: vi.fn().mockRejectedValue(new Error('no')) });
    await userEvent.click(screen.getByRole('button', { name: 'Cancel removal' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('did not go through');
  });
});

describe('Remove from this book…', () => {
  it('is offered on an active moon owner to an officer who may edit', async () => {
    const onRemove = vi.fn();
    page(detail(), { onRemove });
    await userEvent.click(screen.getByRole('button', { name: 'Remove from this book…' }));
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it('is not offered to a viewer, or while a removal is already pending', () => {
    page(detail());
    expect(screen.queryByRole('button', { name: 'Remove from this book…' })).toBeNull();
    page(pending(), { onRemove: () => {} });
    expect(screen.queryByRole('button', { name: 'Remove from this book…' })).toBeNull();
  });
});

describe('RemoveMoonOwnerDialog', () => {
  const open = (hasPayee: boolean, onStart = vi.fn().mockResolvedValue(undefined)) => {
    render(
      <RemoveMoonOwnerDialog
        ownerName="Ostrava Salvage"
        accountingName="Brass Meridian Logistics"
        hasPayee={hasPayee}
        onClose={() => {}}
        onStart={onStart}
      />
    );
    return onStart;
  };

  it('states the 24-hour wait and lists who is mailed', () => {
    open(true);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Remove Ostrava Salvage from this book?');
    expect(dialog).toHaveTextContent('takes effect in 24 hours');
    expect(dialog).toHaveTextContent("Brass Meridian Logistics's other officers");
    expect(dialog).toHaveTextContent("Ostrava Salvage's CEO");
    expect(dialog).toHaveTextContent("Ostrava Salvage's payee");
  });

  it('leaves the payee off the list when there is none', () => {
    open(false);
    expect(screen.getByRole('dialog')).not.toHaveTextContent('payee');
  });

  it('never mentions rates, margins, or developer terms', () => {
    open(true);
    expect(screen.getByRole('dialog').textContent).not.toMatch(
      /miner rate|margin|feeder|collector|48/i
    );
  });

  it('starts the removal on confirm', async () => {
    const onStart = open(true);
    await userEvent.click(screen.getByRole('button', { name: 'Start removal' }));
    expect(onStart).toHaveBeenCalledOnce();
  });
});
