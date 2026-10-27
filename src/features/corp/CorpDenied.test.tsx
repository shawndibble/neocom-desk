import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { beginEveLogin } from '@/app/loginFlow';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { CorpDenied } from './CorpDenied';

vi.mock('@/app/loginFlow', () => ({ beginEveLogin: vi.fn().mockResolvedValue(undefined) }));

const mockedBeginLogin = vi.mocked(beginEveLogin);

beforeEach(() => {
  vi.clearAllMocks();
  useActiveCharacter.setState({ activeCharacterId: 42 });
});

function renderDenied(reason: Parameters<typeof CorpDenied>[0]['reason']) {
  render(<CorpDenied reason={reason} title="Route title" hint="Route hint" />);
}

describe('CorpDenied', () => {
  it.each(['not-granted', 'roles-without-grant'] as const)(
    'offers the corp Grant when the reason is %s',
    async (reason) => {
      renderDenied(reason);
      expect(screen.getByText(/isn't granted for this character/i)).toBeInTheDocument();
      expect(screen.queryByText('Route hint')).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: /grant corporation access/i }));
      expect(mockedBeginLogin).toHaveBeenCalledWith({ characterId: 42, groups: ['corp'] });
    }
  );

  it.each(['none', 'capability'] as const)(
    "keeps the route's own copy, with no Grant, when the reason is %s",
    (reason) => {
      renderDenied(reason);
      expect(screen.getByText('Route hint')).toBeInTheDocument();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    }
  );
});
