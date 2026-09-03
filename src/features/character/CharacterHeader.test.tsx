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

    expect(
      await screen.findByText('Bureau of Unified Harvesting / Plenitude Alliance')
    ).toBeInTheDocument();
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

  it('renders the view-specific controls passed to it', () => {
    render(
      <CharacterHeader
        characterId={CHARACTER_ID}
        totalSp={null}
        unallocatedSp={null}
        actions={<button type="button">Refresh</button>}
      />
    );

    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
  });
});
