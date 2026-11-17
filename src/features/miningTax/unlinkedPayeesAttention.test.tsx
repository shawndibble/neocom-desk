import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from '@/i18n';
import type { PayeeRecord } from '@/db';
import { AttentionStrip } from './AttentionStrip';
import { unlinkedPayeesItem } from './unlinkedPayeesAttention';

const t = i18n.t.bind(i18n);

function payee(id: string, name: string): PayeeRecord {
  return { id, characterId: 1, name, defaultTaxPct: 10, updatedAt: 1 };
}

describe('unlinkedPayeesItem', () => {
  it('is nothing when every Payee is linked', () => {
    expect(unlinkedPayeesItem([], t, vi.fn())).toBeNull();
  });

  it('counts the Payees nobody in EVE answers to, names them, and opens Manage Payees', async () => {
    const open = vi.fn();
    const item = unlinkedPayeesItem([payee('p1', 'Moon 1'), payee('p2', 'Landlord')], t, open);
    expect(item).not.toBeNull();
    render(<AttentionStrip items={item ? [item] : []} />);
    await userEvent.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getAllByText("2 Payees aren't linked to anyone in EVE").length).toBeGreaterThan(
      0
    );
    expect(screen.getByText(/Moon 1, Landlord/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Manage Payees' }));
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('says one Payee in the singular', () => {
    const item = unlinkedPayeesItem([payee('p1', 'Moon 1')], t, vi.fn());
    render(<>{item?.title}</>);
    expect(screen.getByText("1 Payee isn't linked to anyone in EVE")).toBeInTheDocument();
  });
});
