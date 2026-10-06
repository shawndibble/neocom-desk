import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { todayCheck } from './coloniesModel';
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

describe('TodayPanel no-figures line (#2761)', () => {
  it('says prices or skills are still loading when nothing failed', () => {
    renderPanel(false);
    expect(screen.getByText(/still loading/)).toBeInTheDocument();
  });

  it('drops it when the price read failed: the price notice already says why', () => {
    renderPanel(true);
    expect(screen.queryByText(/still loading/)).not.toBeInTheDocument();
  });
});
