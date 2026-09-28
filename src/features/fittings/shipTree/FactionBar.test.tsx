import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { FactionBar } from './FactionBar';
import { SHIP_TREE } from './__fixtures__/shipTreeFixture';

const CALDARI = 500001;
const GALLENTE = 500004;

function renderBar(factionID = CALDARI, onFaction = vi.fn()) {
  return {
    onFaction,
    ...render(
      <FactionBar
        data={SHIP_TREE}
        factionID={factionID}
        statuses={new Map()}
        onFaction={onFaction}
      />
    ),
  };
}

describe('FactionBar', () => {
  it('sizes every faction button at the md touch tier', () => {
    renderBar();
    for (const name of ['Caldari State', 'Gallente Federation', 'Guristas Pirates']) {
      const button = screen.getByRole('button', { name: new RegExp(name) });
      expect(button.className).toMatch(/\bh-11\b/);
      expect(button.className).toMatch(/\bmd:h-9\b/);
    }
  });

  it('still switches faction on tap and marks the active one', async () => {
    const user = userEvent.setup();
    const { onFaction } = renderBar(CALDARI);
    const caldariButton = screen.getByRole('button', { name: /Caldari State/ });
    const gallenteButton = screen.getByRole('button', { name: /Gallente Federation/ });
    expect(caldariButton).toHaveAttribute('aria-pressed', 'true');
    expect(gallenteButton).toHaveAttribute('aria-pressed', 'false');

    await user.click(gallenteButton);
    expect(onFaction).toHaveBeenCalledWith(GALLENTE);
  });

  it('reveals the faction description via Tooltip instead of a hover-only title', () => {
    renderBar();
    const caldariButton = screen.getByRole('button', { name: /Caldari State/ });
    expect(caldariButton).not.toHaveAttribute('title');
  });
});
