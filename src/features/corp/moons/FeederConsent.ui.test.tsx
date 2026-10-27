import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import { FeederConsent } from './FeederConsent';

vi.mock('@/features/character/useEntityName', () => ({ useEntityName: () => undefined }));

describe('FeederConsent', () => {
  it('says the grant also reads the refineries’ names and systems (#4654)', async () => {
    render(
      <FeederConsent
        characterId={1}
        code="abc123DEF456"
        busy={false}
        onContinue={vi.fn()}
        onBack={vi.fn()}
        loadPreview={async () => ({
          collectorCorporationId: 5,
          collectorName: 'Brass Meridian Logistics',
          offeredOwnerRatePct: null,
        })}
      />
    );
    expect(
      await screen.findByText('Brass Meridian Logistics will handle the tax on your moons.')
    ).toBeVisible();
    expect(screen.getByText(/We also read your refineries' names and systems\./)).toBeVisible();
    // The player-facing copy never uses the dev terms.
    expect(document.body.textContent).not.toMatch(/feeder|collector/i);
  });
});
