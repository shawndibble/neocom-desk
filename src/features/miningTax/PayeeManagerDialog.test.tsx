import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db, type PayeeRecord } from '@/db';
import { PayeeManagerDialog } from './PayeeManagerDialog';
import { loadPayees } from './payees';

const syncMock = vi.hoisted(() => ({
  markPayeeDeleted: vi.fn(async () => {}),
  scheduleSync: vi.fn(),
}));
vi.mock('@/sync', () => syncMock);

const CHAR = 1;
const SYSTEM = 30000142;

const characters = [{ characterId: CHAR, characterName: 'Miner Alt' }];

function renderDialog(payees: PayeeRecord[] = []) {
  const onChanged = vi.fn();
  render(
    <PayeeManagerDialog
      open
      onClose={vi.fn()}
      characters={characters}
      payeesByCharacter={new Map([[CHAR, payees]])}
      initialCharacterId={CHAR}
      onChanged={onChanged}
    />
  );
  return { onChanged };
}

async function pickHub(name: string) {
  await userEvent.click(screen.getByRole('combobox', { name: 'Trade hub' }));
  await userEvent.click(screen.getByRole('option', { name }));
}

beforeEach(async () => {
  vi.clearAllMocks();
  await db.payees.clear();
});

describe('PayeeManagerDialog — trade hub', () => {
  it('stores the hub a new Payee is given', async () => {
    renderDialog();

    await userEvent.type(screen.getByLabelText('Payee name'), 'Hek landlord');
    await userEvent.type(screen.getByLabelText('Default tax %'), '10');
    await pickHub('Hek');
    await userEvent.click(screen.getByRole('button', { name: 'Add Payee' }));

    await waitFor(async () => {
      expect((await loadPayees(CHAR))[0]?.hubId).toBe('hek');
    });
  });

  it('stores no hub at all when the default is left in place', async () => {
    renderDialog();

    await userEvent.type(screen.getByLabelText('Payee name'), 'Jita landlord');
    await userEvent.type(screen.getByLabelText('Default tax %'), '10');
    await userEvent.click(screen.getByRole('button', { name: 'Add Payee' }));

    await waitFor(async () => {
      expect((await loadPayees(CHAR)).length).toBe(1);
    });
    // Absent, not `hubId: 'jita'` — one way of saying Jita, the same one every
    // Payee predating this field already says.
    const [payee] = await loadPayees(CHAR);
    expect('hubId' in payee).toBe(false);
  });

  it('opens an existing Payee on its own hub, and can clear it back to the default', async () => {
    const stored: PayeeRecord = {
      id: 'p1',
      characterId: CHAR,
      name: 'Hek landlord',
      defaultTaxPct: 10,
      hubId: 'hek',
      updatedAt: 1,
    };
    await db.payees.put(stored);
    renderDialog([stored]);

    await userEvent.click(screen.getByRole('button', { name: 'Edit Hek landlord' }));
    expect(screen.getByRole('combobox', { name: 'Trade hub' })).toHaveTextContent('Hek');

    await pickHub('Jita (default)');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(async () => {
      expect('hubId' in ((await loadPayees(CHAR))[0] ?? {})).toBe(false);
    });
  });

  it('shows a Payee that names no hub as priced at Jita, never as an error', () => {
    renderDialog([
      { id: 'p1', characterId: CHAR, name: 'Landlord', defaultTaxPct: 10, updatedAt: 1 },
    ]);
    expect(screen.getByText('10% tax · priced at Jita')).toBeInTheDocument();
  });

  it('keeps the remembered system through an edit that only changes the hub', async () => {
    const stored: PayeeRecord = {
      id: 'p1',
      characterId: CHAR,
      name: 'Landlord',
      defaultTaxPct: 10,
      systemId: SYSTEM,
      updatedAt: 1,
    };
    await db.payees.put(stored);
    renderDialog([stored]);

    await userEvent.click(screen.getByRole('button', { name: 'Edit Landlord' }));
    await pickHub('Hek');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    // `updatePayee` deletes any field its input omits, so the auto-match
    // system AssignDialog's "remember this system" learned has to be carried
    // through this form rather than silently dropped by an unrelated edit.
    await waitFor(async () => {
      expect((await loadPayees(CHAR))[0]?.hubId).toBe('hek');
    });
    expect((await loadPayees(CHAR))[0]?.systemId).toBe(SYSTEM);
  });
});
