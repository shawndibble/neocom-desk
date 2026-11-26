import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import '@/i18n';
import { ProofStrip } from './ProofStrip';

describe('ProofStrip', () => {
  it('lists the five facts that hold for the whole app', () => {
    render(<ProofStrip />);
    const items = within(screen.getByRole('list', { name: 'At a glance' })).getAllByRole(
      'listitem'
    );
    expect(items.map((item) => item.textContent)).toEqual([
      '◆Every character on one desk',
      '◆Alerts when the game is closed',
      '◆Installs and opens offline',
      '◆No account, ads or subscription',
      '◆Open source',
    ]);
  });
});
