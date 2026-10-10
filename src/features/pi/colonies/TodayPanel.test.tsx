import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { todayCheck, type ColonyCheckRow, type TodayCheck } from './coloniesModel';
import { TodayPanel } from './TodayPanel';

function renderPanel(pricesFailed: boolean) {
  return render(
    <MemoryRouter>
      <TodayPanel
        rows={[]}
        check={todayCheck([], 0)}
        nowMs={0}
        nameOf={() => 'x'}
        characterNameOf={() => 'y'}
        activeCharacterId={1}
        todayPerDay={null}
        pricesFailed={pricesFailed}
        fixCount={0}
        fixGainPerDay={0}
        ownCount={0}
        includesOthers={false}
        fetchedAt={null}
        cadence={{ restartDays: 3, haulDays: 1 }}
        onHaulDaysChange={() => {}}
        planHref="/pi?tab=plan"
      />
    </MemoryRouter>
  );
}

describe('TodayPanel no-figures line', () => {
  it('says prices or skills are still loading when nothing failed', () => {
    renderPanel(false);
    expect(screen.getByText(/still loading/)).toBeInTheDocument();
  });

  it('drops it when the price read failed: the price notice already says why', () => {
    renderPanel(true);
    expect(screen.queryByText(/still loading/)).not.toBeInTheDocument();
  });
});

describe('TodayPanel login list initials chip', () => {
  const names: Record<number, string> = { 1: 'Bob Smith', 2: 'Alt Pilot' };
  const rows = [1, 2].map((characterId) => ({
    key: `${characterId}:9`,
    characterId,
    planetId: 9,
    planetType: 'barren',
  })) as unknown as ColonyCheckRow[];
  const trip = rows.map((row) => ({ key: row.key, kind: 'restart', atMs: 1000, minutes: 5 }));
  const check = {
    ...todayCheck([], 0),
    loginAtMs: 1000,
    trip,
    tripCharacterIds: [1, 2],
  } as unknown as TodayCheck;

  function renderTrip() {
    return render(
      <MemoryRouter>
        <TodayPanel
          rows={rows}
          check={check}
          nowMs={0}
          nameOf={() => 'Planet'}
          characterNameOf={(id) => names[id]}
          activeCharacterId={1}
          todayPerDay={null}
          pricesFailed={false}
          fixCount={0}
          fixGainPerDay={0}
          ownCount={0}
          includesOthers={false}
          fetchedAt={null}
          cadence={{ restartDays: 3, haulDays: 1 }}
          onHaulDaysChange={() => {}}
          planHref="/pi?tab=plan"
        />
      </MemoryRouter>
    );
  }

  it('names the chip with hidden text and hides the initials', () => {
    renderTrip();
    expect(screen.getByText('Alt Pilot')).toHaveClass('sr-only');
    expect(screen.getByText('AP', { selector: 'span' })).toHaveAttribute('aria-hidden', 'true');
  });

  it('puts no aria-label on a role-less element in the list', () => {
    const { container } = renderTrip();
    expect(container.querySelectorAll('li [aria-label]:not([role])')).toHaveLength(0);
  });
});
