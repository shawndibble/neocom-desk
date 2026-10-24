import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import { db } from '@/db';
import { usePublicInfo } from '@/stores/publicInfo';
import { CharacterHeader } from './CharacterHeader';

const CHARACTER_ID = 77;

beforeEach(async () => {
  await db.characters.clear();
  await db.characters.put({
    characterId: CHARACTER_ID,
    name: 'Mero Otichoda',
    ownerHash: 'oh',
    addedAt: 1,
  });
  // Seeded rather than fetched: a cached entry makes `load()` a no-op, so the
  // component never reaches ESI from a unit test.
  usePublicInfo.setState({
    byCharacterId: {
      [CHARACTER_ID]: { corporationName: 'Bureau of Unified Harvesting', allianceName: null },
    },
  });
});

describe('CharacterHeader', () => {
  it('names the character in the page heading, over its corporation', async () => {
    render(
      <CharacterHeader characterId={CHARACTER_ID} totalSp={82_865_296} unallocatedSp={719_732} />
    );

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Mero Otichoda' })
    ).toBeInTheDocument();
    expect(screen.getByText('Bureau of Unified Harvesting')).toBeInTheDocument();
    expect(screen.getByText('82,865,296')).toBeInTheDocument();
    expect(screen.getByText('719,732')).toBeInTheDocument();
  });

  it('appends the alliance to the corporation when the character has one', async () => {
    usePublicInfo.setState({
      byCharacterId: {
        [CHARACTER_ID]: {
          corporationName: 'Bureau of Unified Harvesting',
          allianceName: 'Plenitude Alliance',
        },
      },
    });
    render(<CharacterHeader characterId={CHARACTER_ID} totalSp={null} unallocatedSp={null} />);

    // One line, each name in its own truncating box.
    expect(
      await screen.findByText(
        (_, element) =>
          element?.tagName === 'P' &&
          element.textContent === 'Bureau of Unified Harvesting / Plenitude Alliance'
      )
    ).toBeInTheDocument();
    const alliance = screen.getByText('Plenitude Alliance');
    expect(alliance).toHaveClass('truncate');
    expect(alliance).toHaveAttribute('title', 'Plenitude Alliance');
    expect(screen.getByText('Bureau of Unified Harvesting')).toHaveAttribute(
      'title',
      'Bureau of Unified Harvesting'
    );
  });

  it('keeps both SP chips in place when the numbers are unavailable', async () => {
    // The chips are the header's fixed shape: dropping them on the tabs that
    // cannot read /skills is exactly the jumping header this component exists
    // to stop.
    render(<CharacterHeader characterId={CHARACTER_ID} totalSp={null} unallocatedSp={null} />);
    await screen.findByRole('heading', { level: 1, name: 'Mero Otichoda' });

    for (const label of ['Total SP', 'Unallocated SP']) {
      // The label's own span is the chip's first child; the chip is its parent.
      expect(screen.getByText(label).parentElement).toHaveTextContent('—');
    }
  });

  it('carries no controls of its own', async () => {
    // It takes no actions slot at all: a view's data age and its Refresh
    // describe that view's data, so they belong to its panel below the tabs.
    // Anything rendered here would be a control that changes from tab to tab
    // in the block every tab shares.
    render(<CharacterHeader characterId={CHARACTER_ID} totalSp={1} unallocatedSp={2} />);
    await screen.findByRole('heading', { level: 1, name: 'Mero Otichoda' });

    // The alerts bell is in every page header, so it is the one button.
    expect(
      screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'))
    ).toEqual(['Alerts, none waiting']);
  });

  it('on the Overview drops both SP chips, and draws the aside beside the name', async () => {
    render(
      <CharacterHeader
        characterId={CHARACTER_ID}
        overview
        aside={<span>aside-slot</span>}
        actions={<button type="button">actions-slot</button>}
      />
    );
    const heading = await screen.findByRole('heading', { level: 1, name: 'Mero Otichoda' });

    expect(screen.queryByText('Total SP')).not.toBeInTheDocument();
    expect(screen.queryByText('Unallocated SP')).not.toBeInTheDocument();
    expect(heading.parentElement).toContainElement(screen.getByText('aside-slot'));
    expect(screen.getByRole('button', { name: 'actions-slot' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Alerts/ })).toBeInTheDocument();
  });

  it('draws aside and actions wherever they are passed, and no SP chips when no SP is passed', async () => {
    render(
      <CharacterHeader
        characterId={CHARACTER_ID}
        aside={<span>aside-slot</span>}
        actions={<button type="button">actions-slot</button>}
      />
    );
    const heading = await screen.findByRole('heading', { level: 1, name: 'Mero Otichoda' });

    expect(heading.parentElement).toContainElement(screen.getByText('aside-slot'));
    expect(screen.getByRole('button', { name: 'actions-slot' })).toBeInTheDocument();
    expect(screen.queryByText('Total SP')).not.toBeInTheDocument();
  });
});
