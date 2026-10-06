import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import '@/i18n';
import { db, type PayeeRecord } from '@/db';
import { PayeeManagerDialog } from './PayeeManagerDialog';
import { loadPayees } from './payees';

const syncMock = vi.hoisted(() => ({
  scheduleSync: vi.fn(),
}));
vi.mock('@/sync', () => syncMock);

const actionsMock = vi.hoisted(() => ({
  deletePayee: vi.fn(async (): Promise<{ ok: boolean; value?: undefined }> => ({
    ok: true,
    value: undefined,
  })),
}));
vi.mock('./ledgerActions', () => actionsMock);

const CHAR = 1;
const SYSTEM = 30000142;

const characters = [{ characterId: CHAR, characterName: 'Miner Alt' }];

type ExtraProps = Pick<
  ComponentProps<typeof PayeeManagerDialog>,
  'owedByPayee' | 'systemsByPayee' | 'systemNames'
>;

function renderDialog(payees: PayeeRecord[] = [], extra: ExtraProps = {}) {
  const onChanged = vi.fn();
  render(
    <PayeeManagerDialog
      open
      onClose={vi.fn()}
      characters={characters}
      payeesByCharacter={new Map([[CHAR, payees]])}
      initialCharacterId={CHAR}
      onChanged={onChanged}
      {...extra}
    />
  );
  return { onChanged };
}

async function openDeleteFor(name: string) {
  await userEvent.click(screen.getByRole('button', { name: `Edit ${name}` }));
  await userEvent.click(await screen.findByRole('button', { name: `Delete ${name}` }));
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

    await userEvent.type(screen.getByLabelText('Name'), 'Hek landlord');
    await userEvent.type(screen.getByLabelText('Default tax %'), '10');
    await pickHub('Hek');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(async () => {
      expect((await loadPayees(CHAR))[0]?.hubId).toBe('hek');
    });
  });

  it('stores no hub at all when the default is left in place', async () => {
    renderDialog();

    await userEvent.type(screen.getByLabelText('Name'), 'Jita landlord');
    await userEvent.type(screen.getByLabelText('Default tax %'), '10');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

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
    expect(screen.getByText('10% · Jita')).toBeInTheDocument();
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

describe('PayeeManagerDialog delete confirmation (#862: no silent delete)', () => {
  const stored: PayeeRecord = {
    id: 'p1',
    characterId: CHAR,
    name: 'Hek landlord',
    defaultTaxPct: 10,
    hubId: 'hek',
    updatedAt: 1,
  };

  beforeEach(async () => {
    await db.payees.put(stored);
  });

  it('opens a modal naming the Payee and does not delete until confirmed', async () => {
    renderDialog([stored]);

    await openDeleteFor('Hek landlord');

    expect(screen.getByText('Delete "Hek landlord"? This can\'t be undone.')).toBeInTheDocument();
    expect(await loadPayees(CHAR)).toHaveLength(1);
  });

  it('leaves the Payee untouched on cancel', async () => {
    renderDialog([stored]);

    await openDeleteFor('Hek landlord');
    await userEvent.click(
      within(screen.getByRole('dialog', { name: 'Delete' })).getByRole('button', {
        name: 'Cancel',
      })
    );

    expect(
      screen.queryByText('Delete "Hek landlord"? This can\'t be undone.')
    ).not.toBeInTheDocument();
    expect(await loadPayees(CHAR)).toHaveLength(1);
  });

  it('leaves the Payee untouched on Escape', async () => {
    renderDialog([stored]);

    await openDeleteFor('Hek landlord');
    await userEvent.keyboard('{Escape}');

    await waitFor(() => {
      expect(
        screen.queryByText('Delete "Hek landlord"? This can\'t be undone.')
      ).not.toBeInTheDocument();
    });
    expect(await loadPayees(CHAR)).toHaveLength(1);
  });

  it('deletes the Payee once confirmed', async () => {
    renderDialog([stored]);

    await openDeleteFor('Hek landlord');
    await userEvent.click(
      within(screen.getByRole('dialog', { name: 'Delete' })).getByRole('button', {
        name: 'Delete',
      })
    );

    await waitFor(() => {
      expect(actionsMock.deletePayee).toHaveBeenCalledWith(stored, undefined);
    });
    expect(
      screen.queryByText('Delete "Hek landlord"? This can\'t be undone.')
    ).not.toBeInTheDocument();
  });
});

describe('PayeeManagerDialog — list rows', () => {
  const bureau: PayeeRecord = {
    id: 'p1',
    characterId: CHAR,
    name: 'Bureau of Unified Harvesting',
    defaultTaxPct: 5,
    updatedAt: 1,
  };
  const police: PayeeRecord = {
    id: 'p2',
    characterId: CHAR,
    name: 'Plenitude Highsec Police',
    defaultTaxPct: 8,
    hubId: 'amarr',
    updatedAt: 1,
  };

  it('shows what each Payee is owed, and Settled when nothing is', () => {
    renderDialog([bureau, police], {
      owedByPayee: new Map([['p1', { amount: 4_309_281, count: 1, moving: 1 }]]),
    });
    expect(screen.getByText('4,309,281 ISK')).toHaveClass('text-isk-neg');
    expect(screen.getByText('Settled')).toBeInTheDocument();
  });

  it('lists the systems mined for a Payee after its rate and hub', () => {
    renderDialog([bureau], {
      systemsByPayee: new Map([['p1', new Set([3, 1, 2])]]),
      systemNames: new Map([
        [1, 'Talidal'],
        [2, 'Sabusi'],
        [3, 'Ainsan'],
      ]),
    });
    expect(screen.getByText('5% · Jita · Ainsan, Sabusi, Talidal')).toBeInTheDocument();
  });

  it('keeps the add form hidden until Add Payee is pressed', async () => {
    renderDialog([bureau]);
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Add Payee' }));

    expect(screen.getByText('Add a Payee')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('');
  });

  it('opens the same form pre-filled on Edit', async () => {
    renderDialog([bureau]);
    await userEvent.click(
      screen.getByRole('button', { name: 'Edit Bureau of Unified Harvesting' })
    );

    expect(screen.getByText('Edit Payee')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('Bureau of Unified Harvesting');
    expect(screen.getByLabelText('Default tax %')).toHaveValue(5);
  });

  it('shows the add form straight away when there are no Payees', () => {
    renderDialog([]);
    expect(screen.getByText('No Payees yet.')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
  });

  it('still reports a missing name', async () => {
    renderDialog([]);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a name for this Payee.');
  });
});

describe('PayeeManagerDialog — deleting a Payee that is still owed', () => {
  const bureau: PayeeRecord = {
    id: 'p1',
    characterId: CHAR,
    name: 'Bureau of Unified Harvesting',
    defaultTaxPct: 5,
    updatedAt: 1,
  };
  const police: PayeeRecord = {
    id: 'p2',
    characterId: CHAR,
    name: 'Plenitude Highsec Police',
    defaultTaxPct: 8,
    updatedAt: 1,
  };
  // Two owed days, one of them in a Combined Entry with a paid day.
  const owedByPayee = new Map([['p1', { amount: 4_309_281, count: 2, moving: 3 }]]);

  beforeEach(async () => {
    await db.payees.bulkPut([bureau, police]);
  });

  it('says what is still owed and moves the entries to another Payee before deleting', async () => {
    renderDialog([bureau, police], { owedByPayee });

    await openDeleteFor('Bureau of Unified Harvesting');
    expect(
      screen.getByText('Bureau of Unified Harvesting still has 2 owed entries (4,309,281 ISK).')
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Moving takes 3 entries, counting the other days of the Combined Entries they're in."
      )
    ).toBeInTheDocument();

    const moveButton = screen.getByRole('button', { name: 'Move and delete' });
    expect(moveButton).toBeDisabled();
    await userEvent.click(screen.getByRole('combobox', { name: 'Move them to…' }));
    await userEvent.click(screen.getByRole('option', { name: 'Plenitude Highsec Police' }));
    await userEvent.click(moveButton);

    await waitFor(() => {
      expect(actionsMock.deletePayee).toHaveBeenCalledWith(bureau, 'p2');
    });
  });

  it('can still delete anyway, leaving the entries where they are', async () => {
    renderDialog([bureau, police], { owedByPayee });

    await openDeleteFor('Bureau of Unified Harvesting');
    await userEvent.click(screen.getByRole('button', { name: 'Delete anyway' }));

    await waitFor(() => {
      expect(actionsMock.deletePayee).toHaveBeenCalledWith(bureau, undefined);
    });
  });

  it('says nothing changed when the delete fails', async () => {
    actionsMock.deletePayee.mockResolvedValueOnce({ ok: false });
    renderDialog([bureau, police], { owedByPayee });

    await openDeleteFor('Bureau of Unified Harvesting');
    await userEvent.click(screen.getByRole('button', { name: 'Delete anyway' }));

    expect(
      await screen.findByText(
        'Couldn’t delete Bureau of Unified Harvesting — nothing was changed. Try again.'
      )
    ).toBeInTheDocument();
  });
});
