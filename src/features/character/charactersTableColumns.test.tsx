import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import i18n from '@/i18n';
import { useNeedsLogin } from '@/stores/authFailure';
import type { AchievementLookup } from '@/features/character/useCharacterAchievements';
import { buildColumns, type CharacterRow } from './charactersTableColumns';

vi.mock('@/app/loginFlow', () => ({ beginEveLogin: vi.fn(async () => {}) }));

const t = (key: string, options?: Record<string, unknown>) => i18n.t(key, options);

function nameCell(characterId: number, name: string) {
  const columns = buildColumns(
    t,
    0,
    null,
    () => {},
    () => {},
    undefined,
    [],
    () => {},
    {} as AchievementLookup
  );
  const row = { character: { characterId, name, ownerHash: 'oh', addedAt: 0 } } as CharacterRow;
  return columns.name.render(row);
}

beforeEach(() => {
  useNeedsLogin.setState({ value: [2], hydrated: true });
});

describe('Characters table name cell', () => {
  it('shows Sign in again on the row of a character whose login is dead', () => {
    render(<>{nameCell(2, 'Ada Vance')}</>);
    expect(screen.getByRole('button', { name: 'Sign in again as Ada Vance' })).toBeInTheDocument();
  });

  it('shows nothing extra on a character whose login works', () => {
    render(<>{nameCell(3, 'Bo Rask')}</>);
    expect(screen.queryByRole('button', { name: /sign in again/i })).not.toBeInTheDocument();
  });
});
