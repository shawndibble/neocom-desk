import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import { db } from '@/db';
import { usePublicInfo } from '@/stores/publicInfo';
import { CompactCharacterHeader } from './CompactCharacterHeader';

const CHARACTER_ID = 77;

beforeEach(async () => {
  await db.characters.clear();
  await db.characters.put({
    characterId: CHARACTER_ID,
    name: 'Mero Otichoda',
    ownerHash: 'oh',
    addedAt: 1,
  });
});

describe('CompactCharacterHeader', () => {
  it('puts the alert bell and the corner control in one column beside the name, and Below under it', async () => {
    usePublicInfo.setState({
      byCharacterId: {
        [CHARACTER_ID]: {
          corporationName: 'Bureau of Unified Harvesting',
          allianceName: 'Plenitude Alliance',
        },
      },
    });
    render(
      <CompactCharacterHeader
        characterId={CHARACTER_ID}
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
