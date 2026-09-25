import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { FittingStats, LayerDefense } from '@/engine/fittings/types';
import { DefensePanel, FitMeters, NotesPanel, OffensePanel } from './FittingPreviewPanels';

const names: Record<number, string> = {
  1: 'Heavy Missile Launcher II',
  2: 'Scourge Fury',
  3: 'Hammerhead II',
};
const typeName = (id: number) => names[id] ?? `#${id}`;

function layer(hp: number): LayerDefense {
  return {
    hp,
    ehp: hp * 2,
    emResonance: 0.5,
    thermalResonance: 0.6,
    kineticResonance: 0.7,
    explosiveResonance: 0.8,
  };
}

function statsWith(overrides: Partial<FittingStats>): FittingStats {
  return {
    cpuUsed: 600,
    cpuTotal: 500,
    powergridUsed: 400,
    powergridTotal: 800,
    calibrationUsed: 0,
    calibrationTotal: 0,
    droneBandwidthUsed: 0,
    droneBandwidthTotal: 0,
    ehp: 30000,
    capacitor: { stable: true, stablePercentage: 61.4 },
    shield: layer(5000),
    armor: layer(3000),
    hull: layer(2000),
    navigation: { maxVelocity: 1118, agility: 0.5, mass: 1, warpSpeed: 3 },
    targeting: { maxTargetRange: 1, maxLockedTargets: 1, scanResolution: 1, signatureRadius: 212 },
    offense: { weapons: [], dps: 0, volley: 0, overheated: null },
    ...overrides,
  } as unknown as FittingStats;
}

describe('OffensePanel', () => {
  it('splits weapons from drones and lists each weapon with its ammo', () => {
    render(
      <OffensePanel
        typeName={typeName}
        stats={statsWith({
          offense: {
            weapons: [
              {
                typeId: 1,
                chargeTypeId: 2,
                isDrone: false,
                count: 6,
                dps: 386,
                volley: 2000,
                overheated: null,
              },
              { typeId: 3, isDrone: true, count: 5, dps: 96, volley: 300, overheated: null },
            ],
            dps: 482,
            volley: 2300,
            overheated: { dps: 551, volley: 2600 },
          },
        })}
      />
    );
    expect(screen.getByText('Total DPS').nextElementSibling).toHaveTextContent('482');
    expect(screen.getByText('Turrets & launchers').nextElementSibling).toHaveTextContent('386');
    expect(screen.getByText('Drones').nextElementSibling).toHaveTextContent('96');
    expect(screen.getByText('Overheated').nextElementSibling).toHaveTextContent('551');
    const row = screen.getByText('Heavy Missile Launcher II ×6').closest('tr') as HTMLElement;
    expect(within(row).getByText('Scourge Fury')).toBeInTheDocument();
    const drone = screen.getByText('Hammerhead II ×5').closest('tr') as HTMLElement;
    expect(within(drone).getByText('—')).toBeInTheDocument();
  });

  it('says so when nothing deals damage', () => {
    render(<OffensePanel typeName={typeName} stats={statsWith({})} />);
    expect(screen.getByText(/No damage/)).toBeInTheDocument();
  });
});

describe('DefensePanel', () => {
  it('shows a resist row per layer, EHP, speed, capacitor and signature', () => {
    render(<DefensePanel stats={statsWith({})} />);
    expect(screen.getByText('Shield')).toBeInTheDocument();
    expect(screen.getByText('Armor')).toBeInTheDocument();
    expect(screen.getByText('Hull')).toBeInTheDocument();
    expect(screen.getByText('Stable at 61%')).toBeInTheDocument();
    expect(screen.getByText('1.1K m/s')).toBeInTheDocument();
    expect(screen.getByText('212 m')).toBeInTheDocument();
  });

  it('reads an unstable capacitor as time to empty', () => {
    render(
      <DefensePanel stats={statsWith({ capacitor: { stable: false, depletesInSeconds: 95 } })} />
    );
    expect(screen.getByText(/Empty in/)).toBeInTheDocument();
  });
});

describe('FitMeters', () => {
  it('flags a resource over the hull limit and hides calibration and bandwidth the hull lacks', () => {
    render(<FitMeters stats={statsWith({})} />);
    const cpu = screen.getByRole('meter', { name: 'CPU' });
    expect(cpu).toHaveAttribute('aria-valuemax', '500');
    expect(cpu.nextElementSibling).toHaveClass('text-danger');
    expect(screen.queryByRole('meter', { name: 'Calibration' })).not.toBeInTheDocument();
    expect(screen.queryByRole('meter', { name: 'Drone bandwidth' })).not.toBeInTheDocument();
  });
});

describe('NotesPanel', () => {
  it('keeps the line breaks of a read-only note', () => {
    render(<NotesPanel text={'first\nsecond'} />);
    expect(screen.getByText(/first/)).toHaveClass('whitespace-pre-wrap');
  });

  it('shows notes that change underneath it while nothing is being typed, and saves only real edits', async () => {
    const onSave = vi.fn();
    const { rerender } = render(<NotesPanel text="Old." onSave={onSave} />);
    rerender(<NotesPanel text="Synced from another device." onSave={onSave} />);
    const box = screen.getByRole('textbox', { name: 'Notes' });
    expect(box).toHaveValue('Synced from another device.');

    await userEvent.click(box);
    await userEvent.tab();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('saves edited notes when the field loses focus, and only if they changed', async () => {
    const onSave = vi.fn();
    render(<NotesPanel text="Overheat late." onSave={onSave} />);
    const box = screen.getByRole('textbox', { name: 'Notes' });
    expect(box).toHaveAttribute('maxlength', '500');

    await userEvent.click(box);
    await userEvent.tab();
    expect(onSave).not.toHaveBeenCalled();

    await userEvent.type(box, ' Kite first.');
    await userEvent.tab();
    expect(onSave).toHaveBeenCalledWith('Overheat late. Kite first.');
  });
});
