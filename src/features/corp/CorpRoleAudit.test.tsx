import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';

vi.mock('@/lib/useRouteSnapshot', () => ({
  useRouteSnapshot: () => ({
    hydrated: true,
    loading: false,
    refresh: vi.fn(),
    refreshCount: 0,
    activeCharacterId: 1,
    data: {
      needsReauth: false,
      loadedAt: 0,
      audit: {
        holders: [
          { characterId: 1, roles: ['Director'], titles: [] },
          { characterId: 2, roles: ['Accountant'], titles: [] },
          { characterId: 3, roles: ['Director'], titles: [] },
        ],
        changes: [],
        titlesKnown: false,
        names: new Map([
          [1, 'Alpha'],
          [2, 'Beta'],
          [3, 'Gamma'],
        ]),
        fetchedAt: null,
        fromCache: false,
      },
    },
  }),
}));
vi.mock('./boardData', () => ({ loadCorporationId: vi.fn() }));
vi.mock('./roleAudit', () => ({ loadRoleAudit: vi.fn() }));

import { CorpRoleAudit } from './CorpRoleAudit';

describe('CorpRoleAudit', () => {
  it('prints the holders summary sentence, not the raw key', () => {
    render(
      <MemoryRouter>
        <CorpRoleAudit tabs={{ bar: null, tabsId: 't', tabId: 'x' }} />
      </MemoryRouter>
    );
    expect(screen.getByText('2 Directors. Members with a sensitive role: 3.')).toBeInTheDocument();
  });
});
