import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { DetectedOwnedStockMap, OwnedStockPlacement } from '@/engine/industry/ownedStock';
import { NARROW_QUERY } from '@/lib/useIsNarrow';
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

/** jsdom's `matchMedia` never matches; the bottom sheet needs the narrow query to. */
const realMatchMedia = window.matchMedia;
afterEach(() => {
  window.matchMedia = realMatchMedia;
});

function goNarrow() {
  window.matchMedia = (media: string) =>
    ({
      media,
      matches: media === NARROW_QUERY,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

const corpLocation = {
  characterId: 1,
  corporationId: 500,
  locationId: 60008494,
  locationType: 'station' as const,
};

const corpPlacement = placement({
  corporationId: 500,
  locationId: 60008494,
  hangars: [
    { division: 1, quantity: 60 },
    { division: 2, quantity: 40 },
  ],
  containers: [{ containerId: 700, typeId: 3465, quantity: 40, hangar: 2 }],
});

const CORP_STATION = 'Acme Corp — Jita IV - Moon 4';

async function openPicker() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /selected/i }));
  return user;
}

describe('OwnedStockScopeControl', () => {
  it('renders a flat, ungrouped tree when no corp placement exists', async () => {
    render(
      <OwnedStockScopeControl
        scope={{ mode: 'selected', locations: [] }}
        detectedStock={stockOf([placement()])}
        detection={detectionOf()}
        onChange={() => {}}
      />
    );
    await openPicker();
    expect(screen.queryByText('Personal')).not.toBeInTheDocument();
    expect(screen.queryByText('Corp Assets')).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Alice — Jita IV - Moon 4' })).toBeInTheDocument();
  });

  it('groups Personal and Corp Assets once a corp placement is present', async () => {
    render(
      <OwnedStockScopeControl
        scope={{ mode: 'selected', locations: [] }}
        detectedStock={stockOf([placement(), corpPlacement])}
        detection={detectionOf()}
        onChange={() => {}}
      />
    );
    await openPicker();
    expect(screen.getByText('Personal')).toBeInTheDocument();
    expect(screen.getByText('Corp Assets')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: CORP_STATION })).toBeInTheDocument();
  });

  it('checking a corp station patches the scope by its corp-owned key', async () => {
    const onChange = vi.fn();
    render(
      <OwnedStockScopeControl
        scope={{ mode: 'selected', locations: [] }}
        detectedStock={stockOf([corpPlacement])}
        detection={detectionOf()}
        onChange={onChange}
      />
    );
    const user = await openPicker();
    await user.click(screen.getByRole('checkbox', { name: CORP_STATION }));
    expect(onChange).toHaveBeenCalledWith({ mode: 'selected', locations: [corpLocation] });
  });

  it('expands a station to its hangars and containers and picks one hangar', async () => {
    const onChange = vi.fn();
    render(
      <OwnedStockScopeControl
        scope={{ mode: 'selected', locations: [] }}
        detectedStock={stockOf([corpPlacement])}
        detection={detectionOf()}
        onChange={onChange}
      />
    );
    const user = await openPicker();
    expect(screen.queryByRole('checkbox', { name: 'Hangar 2' })).toBeNull();
    await user.click(screen.getByRole('button', { name: /Show hangars and containers/ }));
    expect(screen.getByRole('checkbox', { name: 'Container #700' })).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Hangar 2' }));
    expect(onChange).toHaveBeenCalledWith({
      mode: 'selected',
      locations: [],
      hangars: [{ ...corpLocation, division: 2 }],
    });
  });

  it('shows a station as partial when only one hangar is picked', async () => {
    render(
      <OwnedStockScopeControl
        scope={{ mode: 'selected', locations: [], hangars: [{ ...corpLocation, division: 2 }] }}
        detectedStock={stockOf([corpPlacement])}
        detection={detectionOf()}
        onChange={() => {}}
      />
    );
    await openPicker();
    const station = screen.getByRole('checkbox', { name: CORP_STATION });
    expect(station).toHaveProperty('indeterminate', true);
    expect(station).toHaveAttribute('aria-checked', 'mixed');
    // A saved narrowed scope opens on its children.
    expect(screen.getByRole('checkbox', { name: 'Hangar 2' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Hangar 1' })).not.toBeChecked();
  });

  it('shows a whole station with a legacy excluded container as partial', async () => {
    render(
      <OwnedStockScopeControl
        scope={{ mode: 'selected', locations: [corpLocation], excludedContainers: [700] }}
        detectedStock={stockOf([corpPlacement])}
        detection={detectionOf()}
        onChange={() => {}}
      />
    );
    await openPicker();
    expect(screen.getByRole('checkbox', { name: CORP_STATION })).toHaveProperty(
      'indeterminate',
      true
    );
    expect(screen.getByRole('checkbox', { name: 'Container #700' })).not.toBeChecked();
  });

  it('has no separate containers-excluded control', () => {
    render(
      <OwnedStockScopeControl
        scope={{ mode: 'selected', locations: [corpLocation] }}
        detectedStock={stockOf([corpPlacement])}
        detection={detectionOf()}
        onChange={() => {}}
      />
    );
    expect(screen.queryByRole('button', { name: /excluded/i })).toBeNull();
  });

  describe('on a phone', () => {
    function renderNarrow(onChange: (scope: unknown) => void) {
      goNarrow();
      render(
        <OwnedStockScopeControl
          scope={{ mode: 'selected', locations: [] }}
          detectedStock={stockOf([placement()])}
          detection={detectionOf()}
          onChange={onChange}
        />
      );
    }

    it('edits a draft in a bottom sheet and commits only on Apply', async () => {
      const onChange = vi.fn();
      renderNarrow(onChange);
      const user = await openPicker();
      const sheet = await screen.findByRole('dialog');
      await user.click(within(sheet).getByRole('checkbox', { name: 'Alice — Jita IV - Moon 4' }));
      expect(onChange).not.toHaveBeenCalled();
      await user.click(within(sheet).getByRole('button', { name: 'Apply' }));
      expect(onChange).toHaveBeenCalledWith({
        mode: 'selected',
        locations: [{ characterId: 1, locationId: 60003760, locationType: 'station' }],
      });
    });

    it('discards the draft on Cancel', async () => {
      const onChange = vi.fn();
      renderNarrow(onChange);
      const user = await openPicker();
      const sheet = await screen.findByRole('dialog');
      await user.click(within(sheet).getByRole('checkbox', { name: 'Alice — Jita IV - Moon 4' }));
      await user.click(within(sheet).getByRole('button', { name: 'Cancel' }));
      expect(onChange).not.toHaveBeenCalled();
    });
  });
});
