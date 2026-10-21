import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { NO_CORP_CAPABILITIES } from '@/engine/corpRoles';
import { useCorpAccess } from '@/features/corp/useCorpAccess';
import { useCorpTaxBook } from '@/features/corp/taxBook/useCorpTaxBook';
import { CorpMoons } from './CorpMoons';

vi.mock('@/features/corp/useCorpAccess', () => ({ useCorpAccess: vi.fn() }));
vi.mock('@/features/corp/taxBook/useCorpTaxBook', () => ({ useCorpTaxBook: vi.fn() }));
let bookState: object = { status: 'loading' };
vi.mock('@/features/corp/moons/useCorpBook', () => ({
  useCorpBook: () => ({ state: bookState, reload: vi.fn(), characterId: 1, corporationId: 2 }),
}));
vi.mock('@/features/corp/moons/MoonsSetup', () => ({
  MoonsSetup: () => <p>Moons setup</p>,
}));

const request = vi.fn();

function mount(ledger: object, roles: string[] = ['Accountant']) {
  vi.mocked(useCorpAccess).mockReturnValue({
    state: 'ready',
    capabilities: NO_CORP_CAPABILITIES,
    missingScopes: [],
    roles,
    readFailed: false,
    retry: () => {},
  });
  vi.mocked(useCorpTaxBook).mockReturnValue({ ledger: { ...ledger, request } } as never);
  render(
    <MemoryRouter initialEntries={['/corp/moons/extractions']}>
      <CorpMoons />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  bookState = { status: 'loading' };
});

describe('CorpMoons gate', () => {
  it('asks for the mining scope on the first screen that reads the ledger', async () => {
    bookState = { status: 'ready' };
    mount({ state: 'needs-scope', scopes: ['esi-industry.read_corporation_mining.v1'] });
    expect(screen.getByText('Allow the refinery ledger')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Allow mining ledger access' }));
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('skips the mining-scope gate for a corporation with no book (a moon owner)', () => {
    bookState = { status: 'off', verdict: {} };
    mount({ state: 'needs-scope', scopes: ['esi-industry.read_corporation_mining.v1'] });
    expect(screen.getByText('Moons setup')).toBeInTheDocument();
    expect(screen.queryByText('Allow the refinery ledger')).toBeNull();
  });

  it('explains a role that cannot read the ledger instead of offering a grant', () => {
    mount({ state: 'unavailable' }, ['Station_Manager']);
    expect(screen.getByText('Moons need the Accountant role')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Allow mining ledger access' })).toBeNull();
  });

  it('opens the book to a Junior_Accountant, who cannot sync it, without offering the grant', () => {
    mount({ state: 'unavailable' }, ['Junior_Accountant']);
    expect(screen.queryByText('Moons need the Accountant role')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Allow mining ledger access' })).toBeNull();
  });
});
