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
      await screen.findByText(
        (_, element) =>
          element?.tagName === 'P' &&
          element.textContent === 'Bureau of Unified Harvesting / Plenitude Alliance'
      )
    ).toBeInTheDocument();
    const alliance = screen.getByText('Plenitude Alliance');
    expect(alliance).toHaveClass('truncate');
  });

  it('keeps both SP chips in place when the numbers are unavailable', async () => {
    render(<CharacterHeader characterId={CHARACTER_ID} totalSp={null} unallocatedSp={null} />);
    await screen.findByRole('heading', { level: 1, name: 'Mero Otichoda' });

    for (const label of ['Total SP', 'Unallocated SP']) {
      expect(screen.getByText(label).parentElement).toHaveTextContent('—');
    }
  });

  it('carries no controls of its own', async () => {
    render(<CharacterHeader characterId={CHARACTER_ID} totalSp={1} unallocatedSp={2} />);
    await screen.findByRole('heading', { level: 1, name: 'Mero Otichoda' });

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

  it('compact puts the alert bell and the corner control in one column beside the name, and Below under it', async () => {
    usePublicInfo.setState({
      byCharacterId: {
        [CHARACTER_ID]: {
          corporationName: 'Bureau of Unified Harvesting',
          allianceName: 'Plenitude Alliance',
        },
      },
    });
    render(
      <CharacterHeader
        characterId={CHARACTER_ID}
        overview
        compact
        corner={<button type="button">corner-slot</button>}
        below={<p>below-slot</p>}
      />
    );
    const heading = await screen.findByRole('heading', { level: 1, name: 'Mero Otichoda' });

    const bell = screen.getByRole('button', { name: /^Alerts/ });
    const corner = screen.getByRole('button', { name: 'corner-slot' });
    expect(bell.parentElement).toBe(corner.parentElement);
    expect(bell.compareDocumentPosition(corner) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(heading.parentElement).not.toContainElement(corner);
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === 'P' &&
          element.textContent === 'Bureau of Unified Harvesting · Plenitude Alliance'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText('below-slot').compareDocumentPosition(heading) &
        Node.DOCUMENT_POSITION_PRECEDING
    ).toBeTruthy();
  });
});
