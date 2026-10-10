import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { BlueprintCatalog, BlueprintCatalogEntry } from './blueprintCatalog';
import { BlueprintPicker } from './BlueprintPicker';

const entry = (blueprintTypeID: number, productName: string) =>
  ({
    blueprintTypeID,
    productTypeID: blueprintTypeID + 1,
    productName,
    productNameLower: productName.toLowerCase(),
  }) as unknown as BlueprintCatalogEntry;

const catalog = {
  entries: [entry(1, 'Rifter'), entry(3, 'Rifter Fleet Issue'), entry(5, 'Merlin')],
} as unknown as BlueprintCatalog;

const searchbox = () => screen.getByRole('searchbox', { name: /add build plan/i });

describe('BlueprintPicker', () => {
  it('announces the result count; an empty query stays silent', async () => {
    const user = userEvent.setup();
    render(<BlueprintPicker catalog={catalog} onPick={() => {}} />);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    await user.type(searchbox(), 'Rifter');
    expect(await screen.findByText('2 blueprints found')).toBeInTheDocument();
    await user.clear(searchbox());
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('announces when nothing matches', async () => {
    const user = userEvent.setup();
    render(<BlueprintPicker catalog={catalog} onPick={() => {}} />);
    await user.type(searchbox(), 'zzz');
    expect(await screen.findByText('No blueprints found')).toBeInTheDocument();
  });

  it('keeps focus on the search box after a pick', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<BlueprintPicker catalog={catalog} onPick={onPick} />);
    await user.type(searchbox(), 'Merlin');
    await user.click(screen.getByRole('button', { name: /^Merlin/ }));
    expect(onPick).toHaveBeenCalledOnce();
    expect(searchbox()).toHaveFocus();
  });
});
