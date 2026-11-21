import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import '@/i18n';
import { db, type PayeeRecord } from '@/db';
import type { PayeeRunningAccount } from '@/engine/miningTax/payeeRunningAccount';
import { PayeeManagerDialog } from './PayeeManagerDialog';
import { loadPayees } from './payees';

const searchMock = vi.hoisted(() => ({
  searchPayeeEntities: vi.fn<(...args: unknown[]) => Promise<unknown[]>>(async () => []),
  resolvePayeeName: vi.fn<(name: string) => Promise<unknown[]>>(async () => []),
}));
vi.mock('./payeeEntitySearch', () => ({
  MIN_PAYEE_SEARCH_LENGTH: 3,
  searchPayeeEntities: searchMock.searchPayeeEntities,
  resolvePayeeName: searchMock.resolvePayeeName,
}));
vi.mock('@/app/useGrantedScopes', () => ({ useEndpointsGranted: () => true }));
vi.mock('@/features/route/SolarSystemPicker', () => ({
  SolarSystemPicker: ({
    onChange,
    ariaLabel,
    value,
  }: {
    onChange: (id: number) => void;
    ariaLabel: string;
    value: number | null;
  }) => (
    <button type="button" data-value={String(value)} onClick={() => onChange(30000142)}>
      {ariaLabel}
    </button>
  ),
}));
vi.mock('@/features/route/useSolarSystems', () => ({
  useSystemName: (id: number | null) => (id === 30000142 ? 'Jita' : id === null ? null : `#${id}`),
}));

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
  | 'owedByPayee'
  | 'systemsByPayee'
  | 'systemNames'
  | 'bookCorporations'
  | 'accountOf'
  | 'onOpenLedger'
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

/** The id the default lookup gives any typed name: one EVE corporation of that name. */
const LOOKED_UP_ID = 98_000_100;

beforeEach(async () => {
  vi.clearAllMocks();
  searchMock.searchPayeeEntities.mockResolvedValue([]);
  // A Payee must be someone in EVE: unless a test says otherwise, every typed
  // name is exactly one corporation.
  searchMock.resolvePayeeName.mockImplementation(async (name: string) => [
    { id: LOOKED_UP_ID, name: name.trim(), kind: 'corporation' },
  ]);
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
    expect(screen.getByText('10% · priced at Jita')).toBeInTheDocument();
  });

  it('keeps the Default Systems through an edit that only changes the hub', async () => {
    const stored: PayeeRecord = {
      id: 'p1',
      characterId: CHAR,
      name: 'Landlord',
      defaultTaxPct: 10,
      defaultSystems: [{ systemId: SYSTEM, from: '2026-10-01' }],
      updatedAt: 1,
    };
    await db.payees.put(stored);
    renderDialog([stored]);

    await userEvent.click(screen.getByRole('button', { name: 'Edit Landlord' }));
    await pickHub('Hek');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(async () => {
      expect((await loadPayees(CHAR))[0]?.hubId).toBe('hek');
    });
    // Still defaulted, and still from the day it was added.
    expect((await loadPayees(CHAR))[0]?.defaultSystems).toEqual([
      { systemId: SYSTEM, from: '2026-10-01' },
    ]);
  });
});

describe('PayeeManagerDialog — Default Systems', () => {
  const landlord: PayeeRecord = {
    id: 'p1',
    characterId: CHAR,
    name: 'Landlord',
    defaultTaxPct: 10,
    updatedAt: 1,
  };

  it('adds a system to a Payee and saves it', async () => {
    await db.payees.put(landlord);
    renderDialog([landlord]);

    await userEvent.click(screen.getByRole('button', { name: 'Edit Landlord' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add a default system' }));
    expect(screen.getByText('Jita')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(async () => {
      expect((await loadPayees(CHAR))[0]?.defaultSystems?.map((s) => s.systemId)).toEqual([SYSTEM]);
    });
  });

  it('removes a system again', async () => {
    const held: PayeeRecord = {
      ...landlord,
      defaultSystems: [{ systemId: SYSTEM, from: '2026-10-01' }],
    };
    await db.payees.put(held);
    renderDialog([held]);

    await userEvent.click(screen.getByRole('button', { name: 'Edit Landlord' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove Jita' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(async () => {
      expect('defaultSystems' in (await loadPayees(CHAR))[0]).toBe(false);
    });
  });

  it('says which Payee already has a system, and saves nothing, when another claims it', async () => {
    const held: PayeeRecord = {
      ...landlord,
      defaultSystems: [{ systemId: SYSTEM, from: '2026-10-01' }],
    };
    const other: PayeeRecord = { ...landlord, id: 'p2', name: 'Other' };
    await db.payees.bulkPut([held, other]);
    renderDialog([held, other]);

    await userEvent.click(screen.getByRole('button', { name: 'Edit Other' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add a default system' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Jita is already the default system of Landlord. Remove it there first.'
    );
    expect((await loadPayees(CHAR)).find((p) => p.id === 'p2')?.defaultSystems).toBeUndefined();
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

  it("reads a personal Payee's credit off its Running account", () => {
    const account = { credit: 500_000 } as PayeeRunningAccount;
    renderDialog([bureau, police], {
      owedByPayee: new Map(),
      accountOf: (id) => (id === 'p1' ? account : undefined),
    });
    expect(screen.getByText('500,000 ISK credit')).toHaveClass('text-isk-pos');
    expect(screen.getByText('Settled')).toBeInTheDocument();
  });

  it("opens any Payee's ledger from its balance, settled or not, when it has an account", async () => {
    const onOpenLedger = vi.fn();
    const account = { credit: 0 } as PayeeRunningAccount;
    renderDialog([bureau, police], {
      owedByPayee: new Map(),
      accountOf: (id) => (id === 'p1' ? account : undefined),
      onOpenLedger,
    });
    await userEvent.click(
      screen.getByRole('button', { name: `Open the ledger of ${bureau.name}` })
    );
    expect(onOpenLedger).toHaveBeenCalledWith('p1');
    // Nothing ever billed: no account, so no ledger to open.
    expect(screen.queryByRole('button', { name: `Open the ledger of ${police.name}` })).toBeNull();
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
    expect(
      screen.getByText('5% · priced at Jita · mined in Ainsan, Sabusi, Talidal')
    ).toBeInTheDocument();
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

describe('PayeeManagerDialog — a Payee is someone in EVE', () => {
  const corp = { id: 98_000_001, name: 'Moon Corp', kind: 'corporation' };

  async function fillAndSave(name: string) {
    await userEvent.type(screen.getByLabelText('Name'), name);
    await userEvent.type(screen.getByLabelText('Default tax %'), '10');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  }

  it('stores the entity of a picked suggestion without looking the name up again', async () => {
    searchMock.searchPayeeEntities.mockResolvedValue([corp]);
    renderDialog();

    await userEvent.type(screen.getByLabelText('Name'), 'Moon');
    await userEvent.click(await screen.findByRole('option', { name: /Moon Corp/ }));
    expect(screen.getByText(/Corporation — verified/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Default tax %'), '10');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(async () => {
      expect((await loadPayees(CHAR))[0]).toMatchObject({
        name: 'Moon Corp',
        entityId: 98_000_001,
        entityKind: 'corporation',
      });
    });
    expect(searchMock.resolvePayeeName).not.toHaveBeenCalled();
  });

  it('never suggests an alliance: a new Payee is a corporation or a character', async () => {
    searchMock.searchPayeeEntities.mockResolvedValue([
      corp,
      { id: 99_000_001, name: 'Moon Alliance', kind: 'alliance' },
    ]);
    renderDialog();

    await userEvent.type(screen.getByLabelText('Name'), 'Moon');
    expect(await screen.findByRole('option', { name: /Moon Corp/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Moon Alliance/ })).not.toBeInTheDocument();
  });

  it('links a typed name that is exactly one corporation, spelled as EVE spells it', async () => {
    searchMock.resolvePayeeName.mockResolvedValue([corp]);
    renderDialog();

    await fillAndSave('moon corp');

    await waitFor(async () => {
      expect((await loadPayees(CHAR))[0]).toMatchObject({
        name: 'Moon Corp',
        entityId: 98_000_001,
        entityKind: 'corporation',
      });
    });
  });

  // Replaces "saves a moon label with no match as an unverified free-text
  // Payee": an unlinked Payee on one device made a member's Corp Tax Book days
  // read as Conflicts, and a Payee is who the ISK goes to, so it must be someone
  // in game. A moon or place name no longer saves.
  it('saves nothing for a name no corporation or character has, and says what to do', async () => {
    searchMock.resolvePayeeName.mockResolvedValue([]);
    renderDialog();

    await fillAndSave('Moon 1 Planet 2');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No corporation or character in EVE is named Moon 1 Planet 2. Pick one from the suggestions, spelled as it is in game.'
    );
    expect(await loadPayees(CHAR)).toEqual([]);
    expect(screen.getByLabelText('Name')).toHaveValue('Moon 1 Planet 2');
  });

  it('saves nothing for an alliance-only name', async () => {
    searchMock.resolvePayeeName.mockResolvedValue([
      { id: 99_000_001, name: 'Moon Alliance', kind: 'alliance' },
    ]);
    renderDialog();

    await fillAndSave('Moon Alliance');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No corporation or character in EVE is named Moon Alliance.'
    );
    expect(await loadPayees(CHAR)).toEqual([]);
  });

  it('lets the pilot pick when a corporation and a character share the name, never guessing', async () => {
    searchMock.resolvePayeeName.mockResolvedValue([
      { id: 98_000_002, name: 'Moon', kind: 'corporation' },
      { id: 90_000_002, name: 'Moon', kind: 'character' },
    ]);
    renderDialog();

    await fillAndSave('Moon');

    expect(
      await screen.findByText('More than one in EVE is named Moon. Pick which:')
    ).toBeInTheDocument();
    expect(await loadPayees(CHAR)).toEqual([]);
    await userEvent.click(screen.getByRole('button', { name: 'Moon · Character' }));

    await waitFor(async () => {
      expect((await loadPayees(CHAR))[0]).toMatchObject({
        name: 'Moon',
        entityId: 90_000_002,
        entityKind: 'character',
      });
    });
  });

  // An answer for an earlier draft must never fill the choices of the one now open.
  it('drops a lookup that answers after the pilot changed the name', async () => {
    let answer: (m: unknown[]) => void = () => {};
    searchMock.resolvePayeeName.mockImplementationOnce(
      () => new Promise((resolve) => (answer = resolve))
    );
    renderDialog();

    await fillAndSave('Moon');
    await userEvent.type(screen.getByLabelText('Name'), ' Two');
    answer([
      { id: 98_000_002, name: 'Moon', kind: 'corporation' },
      { id: 90_000_002, name: 'Moon', kind: 'character' },
    ]);

    await waitFor(() => expect(screen.getByLabelText('Name')).toHaveValue('Moon Two'));
    expect(screen.queryByText(/Pick which/)).toBeNull();
    expect(await loadPayees(CHAR)).toEqual([]);
  });

  // Picking a suggestion is a new draft too: a lookup still pending for the typed name is dropped.
  it('drops a lookup that answers after the pilot picked a suggestion', async () => {
    let answer: (m: unknown[]) => void = () => {};
    searchMock.resolvePayeeName.mockImplementationOnce(
      () => new Promise((resolve) => (answer = resolve))
    );
    searchMock.searchPayeeEntities.mockResolvedValue([corp]);
    renderDialog();

    await fillAndSave('Moon');
    await userEvent.click(screen.getByLabelText('Name'));
    await userEvent.click(await screen.findByRole('option', { name: /Moon Corp/ }));
    answer([
      { id: 98_000_002, name: 'Moon', kind: 'corporation' },
      { id: 90_000_002, name: 'Moon', kind: 'character' },
    ]);

    expect(await screen.findByText(/Corporation — verified/)).toBeInTheDocument();
    expect(screen.queryByText(/Pick which/)).toBeNull();
    expect(await loadPayees(CHAR)).toEqual([]);
  });

  it('saves nothing and says to try again when the lookup fails', async () => {
    searchMock.resolvePayeeName.mockRejectedValue(new Error('offline'));
    renderDialog();

    await fillAndSave('Moon Corp');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't check that name with EVE. Try again."
    );
    expect(await loadPayees(CHAR)).toEqual([]);
  });

  it('edits a linked Payee without asking EVE again when the name is unchanged', async () => {
    const stored: PayeeRecord = {
      id: 'p1',
      characterId: CHAR,
      name: 'Moon Corp',
      defaultTaxPct: 10,
      entityId: 98_000_001,
      entityKind: 'corporation',
      updatedAt: 1,
    };
    await db.payees.put(stored);
    searchMock.resolvePayeeName.mockRejectedValue(new Error('offline'));
    renderDialog([stored]);

    await userEvent.click(screen.getByRole('button', { name: 'Edit Moon Corp' }));
    await userEvent.clear(screen.getByLabelText('Default tax %'));
    await userEvent.type(screen.getByLabelText('Default tax %'), '12');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(async () => {
      expect((await loadPayees(CHAR))[0]).toMatchObject({
        defaultTaxPct: 12,
        entityId: 98_000_001,
        entityKind: 'corporation',
      });
    });
    expect(searchMock.resolvePayeeName).not.toHaveBeenCalled();
  });

  it('keeps an alliance Payee from before working and editable', async () => {
    const stored: PayeeRecord = {
      id: 'p1',
      characterId: CHAR,
      name: 'Moon Alliance',
      defaultTaxPct: 10,
      entityId: 99_000_001,
      entityKind: 'alliance',
      updatedAt: 1,
    };
    await db.payees.put(stored);
    renderDialog([stored]);

    await userEvent.click(screen.getByRole('button', { name: 'Edit Moon Alliance' }));
    await pickHub('Hek');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(async () => {
      expect((await loadPayees(CHAR))[0]).toMatchObject({
        hubId: 'hek',
        entityId: 99_000_001,
        entityKind: 'alliance',
      });
    });
    expect(searchMock.resolvePayeeName).not.toHaveBeenCalled();
  });

  it('marks an unlinked Payee as not found in EVE, and saving it links it', async () => {
    const stored: PayeeRecord = {
      id: 'p1',
      characterId: CHAR,
      name: 'Moon Corp',
      defaultTaxPct: 10,
      updatedAt: 1,
    };
    await db.payees.put(stored);
    searchMock.resolvePayeeName.mockResolvedValue([corp]);
    renderDialog([stored]);

    expect(screen.getByText('Not found in EVE — edit to pick who this is')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Edit Moon Corp' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(async () => {
      expect((await loadPayees(CHAR))[0]).toMatchObject({ entityId: 98_000_001 });
    });
  });

  // Never locked: an old label EVE doesn't know keeps working; its rate still changes.
  it('saves an old unlinked Payee under its own name even when EVE knows no such name', async () => {
    const stored: PayeeRecord = {
      id: 'p1',
      characterId: CHAR,
      name: 'Moon 1 Planet 2',
      defaultTaxPct: 10,
      updatedAt: 1,
    };
    await db.payees.put(stored);
    searchMock.resolvePayeeName.mockResolvedValue([]);
    renderDialog([stored]);

    await userEvent.click(screen.getByRole('button', { name: 'Edit Moon 1 Planet 2' }));
    const pct = screen.getByLabelText('Default tax %');
    await userEvent.clear(pct);
    await userEvent.type(pct, '12');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(async () => {
      expect((await loadPayees(CHAR))[0]).toMatchObject({ defaultTaxPct: 12 });
    });
    expect('entityId' in (await loadPayees(CHAR))[0]).toBe(false);
  });

  // A link learned from a payment (an id, no kind) is tied to its name too.
  it('asks EVE again when a Payee linked from a payment is renamed', async () => {
    const stored: PayeeRecord = {
      id: 'p1',
      characterId: CHAR,
      name: 'Moon Corp',
      defaultTaxPct: 10,
      entityId: 98_000_001,
      updatedAt: 1,
    };
    await db.payees.put(stored);
    searchMock.resolvePayeeName.mockResolvedValue([]);
    renderDialog([stored]);

    await userEvent.click(screen.getByRole('button', { name: 'Edit Moon Corp' }));
    const name = screen.getByLabelText('Name');
    await userEvent.clear(name);
    await userEvent.type(name, 'Somebody Else');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(searchMock.resolvePayeeName).toHaveBeenCalled();
    expect((await loadPayees(CHAR))[0]).toMatchObject({ name: 'Moon Corp', entityId: 98_000_001 });
  });

  it('looks the new name up when a linked Payee is renamed', async () => {
    const stored: PayeeRecord = {
      id: 'p1',
      characterId: CHAR,
      name: 'Moon Corp',
      defaultTaxPct: 10,
      entityId: 98_000_001,
      entityKind: 'corporation',
      updatedAt: 1,
    };
    await db.payees.put(stored);
    renderDialog([stored]);

    await userEvent.click(screen.getByRole('button', { name: 'Edit Moon Corp' }));
    await userEvent.type(screen.getByLabelText('Name'), ' Holdings');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(async () => {
      expect((await loadPayees(CHAR))[0]).toMatchObject({
        name: 'Moon Corp Holdings',
        entityId: LOOKED_UP_ID,
        entityKind: 'corporation',
      });
    });
  });
});

describe('PayeeManagerDialog — linking a Payee named for a Corp Tax Book corporation (#6205)', () => {
  const bookCorporations = [{ corporationId: 98_000_007, name: 'Corp A' }];

  it('shows the credit the book holds where a settled Payee would read Settled', async () => {
    const stored: PayeeRecord = {
      id: 'corp-a',
      characterId: CHAR,
      name: 'Corp A',
      defaultTaxPct: 8,
      entityId: 98_000_007,
      entityKind: 'corporation',
      updatedAt: 1,
    };
    await db.payees.bulkPut([stored]);
    renderDialog([stored], {
      owedByPayee: new Map(),
      bookCorporations: [{ ...bookCorporations[0], credit: 1_250_000 }],
    });
    expect(await screen.findByText('1,250,000 ISK credit')).toBeInTheDocument();
    expect(screen.queryByText('Settled')).not.toBeInTheDocument();
  });

  it('suggests the link on create, and saving stores it as the corporation', async () => {
    searchMock.resolvePayeeName.mockResolvedValue([]);
    renderDialog([], { bookCorporations });

    await userEvent.type(screen.getByLabelText('Name'), 'corp a');
    await userEvent.click(screen.getByRole('button', { name: 'Link to Corp A' }));
    expect(screen.queryByRole('button', { name: 'Link to Corp A' })).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Default tax %'), '10');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(async () => {
      expect((await loadPayees(CHAR))[0]).toMatchObject({
        name: 'Corp A',
        entityId: 98_000_007,
        entityKind: 'corporation',
      });
    });
  });

  it('suggests the link when editing an unlinked Payee of that name', async () => {
    const stored: PayeeRecord = {
      id: 'p1',
      characterId: CHAR,
      name: 'Corp A',
      defaultTaxPct: 10,
      updatedAt: 1,
    };
    await db.payees.put(stored);
    renderDialog([stored], { bookCorporations });

    await userEvent.click(screen.getByRole('button', { name: 'Edit Corp A' }));
    expect(screen.getByText(/Corp A keeps a Corp Tax Book/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Link to Corp A' })).toBeInTheDocument();
  });

  it('spans the link note across the form grid, so its long sentence cannot widen the label column', async () => {
    const stored: PayeeRecord = {
      id: 'p1',
      characterId: CHAR,
      name: 'Corp A',
      defaultTaxPct: 10,
      updatedAt: 1,
    };
    await db.payees.put(stored);
    renderDialog([stored], { bookCorporations });

    await userEvent.click(screen.getByRole('button', { name: 'Edit Corp A' }));
    expect(screen.getByText(/Corp A keeps a Corp Tax Book/).parentElement).toHaveClass(
      'col-span-full'
    );
  });

  it('suggests nothing for a Payee already linked to that corporation', async () => {
    const stored: PayeeRecord = {
      id: 'p1',
      characterId: CHAR,
      name: 'Corp A',
      defaultTaxPct: 10,
      entityId: 98_000_007,
      entityKind: 'corporation',
      updatedAt: 1,
    };
    await db.payees.put(stored);
    renderDialog([stored], { bookCorporations });

    await userEvent.click(screen.getByRole('button', { name: 'Edit Corp A' }));
    expect(screen.queryByRole('button', { name: 'Link to Corp A' })).not.toBeInTheDocument();
  });
});

describe('PayeeManagerDialog — one Payee per recipient', () => {
  const corp = { entityId: 98_000_001, entityKind: 'corporation' as const };
  const two = [
    { id: 'a', characterId: CHAR, name: 'BUH', defaultTaxPct: 10, updatedAt: 1, ...corp },
    { id: 'b', characterId: 2, name: 'BUH', defaultTaxPct: 7, updatedAt: 1, ...corp },
  ] satisfies PayeeRecord[];

  function renderTwoCharacters() {
    const onChanged = vi.fn();
    render(
      <PayeeManagerDialog
        open
        onClose={vi.fn()}
        characters={[...characters, { characterId: 2, characterName: 'Second Alt' }]}
        payeesByCharacter={
          new Map([
            [CHAR, [two[0]]],
            [2, [two[1]]],
          ])
        }
        initialCharacterId={CHAR}
        onChanged={onChanged}
      />
    );
  }

  it('lists a recipient once and lets the pilot pick which terms all its records use', async () => {
    await db.payees.bulkPut(two);
    renderTwoCharacters();

    expect(screen.getAllByText('BUH')).toHaveLength(1);
    expect(screen.getByText('Used by 2 characters')).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: /Use 7% · Jita for all \(Second Alt\)/ })
    );

    await waitFor(async () => {
      expect((await db.payees.get('a'))?.defaultTaxPct).toBe(7);
    });
    expect((await db.payees.get('b'))?.defaultTaxPct).toBe(7);
    expect(screen.queryByText('Your characters bill this Payee differently.')).toBeNull();
  });
});
