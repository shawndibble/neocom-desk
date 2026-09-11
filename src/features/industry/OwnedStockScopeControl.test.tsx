import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { DetectedOwnedStockMap, OwnedStockPlacement } from '@/engine/industry/ownedStock';
import type { OwnedStockDetection } from './ownedStockDetection';
import { OwnedStockScopeControl } from './OwnedStockScopeControl';

const CHARACTER_NAMES: Record<number, string> = { 1: 'Alice' };
const CORP_NAMES: Record<number, string> = { 500: 'Acme Corp' };

function placement(overrides: Partial<OwnedStockPlacement> = {}): OwnedStockPlacement {
  return {
    characterId: 1,
    locationId: 60003760,
    locationType: 'station',
    quantity: 100,
    ...overrides,
  };
}

function detectionOf(overrides: Partial<OwnedStockDetection> = {}): OwnedStockDetection {
  return {
    stockFor: () => undefined,
    scopedQuantityFor: () => 0,
    lowerBound: false,
    incompleteCharacters: [],
    characterNameFor: (characterId) => CHARACTER_NAMES[characterId] ?? 'Unknown',
    corporationNameFor: (corporationId) => CORP_NAMES[corporationId] ?? 'Unknown Corp',
    locationLabelFor: () => 'Jita IV - Moon 4',
    ...overrides,
  };
}

function stockOf(placements: readonly OwnedStockPlacement[]): DetectedOwnedStockMap {
  return new Map([
    [
      34,
      {
        quantity: placements.reduce((sum, p) => sum + p.quantity, 0),
        placements: [...placements],
      },
    ],
  ]);
}

async function openMenu() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /selected/i }));
  return user;
}

describe('OwnedStockScopeControl', () => {
  it('renders a flat, ungrouped list when no corp placement exists', async () => {
    render(
      <OwnedStockScopeControl
        scope={{ mode: 'selected', locations: [] }}
        detectedStock={stockOf([placement()])}
        detection={detectionOf()}
        onChange={() => {}}
      />
    );
    await openMenu();
    expect(screen.queryByText('Personal')).not.toBeInTheDocument();
    expect(screen.queryByText('Corp Assets')).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Alice — Jita IV - Moon 4' })).toBeInTheDocument();
  });

  it('groups Personal and Corp Assets once a corp placement is present', async () => {
    render(
      <OwnedStockScopeControl
        scope={{ mode: 'selected', locations: [] }}
        detectedStock={stockOf([
          placement(),
          placement({ characterId: 1, corporationId: 500, locationId: 60008494 }),
        ])}
        detection={detectionOf()}
        onChange={() => {}}
      />
    );
    await openMenu();
    expect(screen.getByText('Personal')).toBeInTheDocument();
    expect(screen.getByText('Corp Assets')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Alice — Jita IV - Moon 4' })).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: 'Acme Corp — Jita IV - Moon 4' })
    ).toBeInTheDocument();
  });

  it('toggling a corp location patches the scope by its corp-owned key, not the reading character', async () => {
    const onChange = vi.fn();
    render(
      <OwnedStockScopeControl
        scope={{ mode: 'selected', locations: [] }}
        detectedStock={stockOf([
          placement({ characterId: 1, corporationId: 500, locationId: 60008494 }),
        ])}
        detection={detectionOf()}
        onChange={onChange}
      />
    );
    const user = await openMenu();
    await user.click(screen.getByRole('option', { name: 'Acme Corp — Jita IV - Moon 4' }));
    expect(onChange).toHaveBeenCalledWith({
      mode: 'selected',
      locations: [
        { characterId: 1, corporationId: 500, locationId: 60008494, locationType: 'station' },
      ],
    });
  });
});
