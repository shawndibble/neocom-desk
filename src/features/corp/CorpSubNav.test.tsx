import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { NO_CORP_CAPABILITIES, type CorpCapabilities } from '@/engine/corpRoles';
import { useCorpAccess } from './useCorpAccess';
import { CorpSubNav } from './CorpSubNav';

vi.mock('./useCorpAccess', () => ({ useCorpAccess: vi.fn() }));

const mockedAccess = vi.mocked(useCorpAccess);

function access(capabilities: Partial<CorpCapabilities>) {
  return {
    state: 'ready' as const,
    capabilities: { ...NO_CORP_CAPABILITIES, ...capabilities },
    missingScopes: [],
    roles: [],
  };
}

function renderNav() {
  render(
    <MemoryRouter initialEntries={['/corp']}>
      <CorpSubNav />
    </MemoryRouter>
  );
}

beforeEach(() => vi.clearAllMocks());

describe('CorpSubNav (AC1)', () => {
  it('offers Members to a character with the membership capability', () => {
    mockedAccess.mockReturnValue(access({ canReadMembers: true }));
    renderNav();
    expect(screen.getByRole('link', { name: 'Members' })).toHaveAttribute('href', '/corp/members');
  });

  /**
   * `ready` is the gate on the section, not a promise about this view.
   * `membertracking` answers to Director alone, so an Accountant following a
   * Members tab would land on an explanation instead of a table — the entry is
   * absent rather than locked (CONTEXT.md round 35).
   */
  it('hides Members from a ready character without it', () => {
    mockedAccess.mockReturnValue(access({ canReadWallet: true }));
    renderNav();
    expect(screen.queryByRole('link', { name: 'Members' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Overview' })).toBeInTheDocument();
  });

  it('offers Assets to a character with the assets capability', () => {
    mockedAccess.mockReturnValue(access({ canReadAssets: true }));
    renderNav();
    expect(screen.getByRole('link', { name: 'Assets' })).toHaveAttribute('href', '/corp/assets');
  });

  /** Same hide rule as Members, one level down: canReadAssets is Director-only. */
  it('hides Assets from a ready character without it', () => {
    mockedAccess.mockReturnValue(access({ canReadWallet: true }));
    renderNav();
    expect(screen.queryByRole('link', { name: 'Assets' })).not.toBeInTheDocument();
  });
});
