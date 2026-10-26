import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@/i18n';
import type { SurveyConnection } from '@/engine/miningTax/surveyConnection';
import { AutoAssignmentBar } from './AutoAssignmentBar';
import { useSurveyConnections } from './surveyConnections';

vi.mock('@/sync', () => ({ scheduleSync: vi.fn(), setSyncedSetting: vi.fn() }));

const NOW = Date.UTC(2026, 9, 21, 12);

function connection(overrides: Partial<SurveyConnection> = {}): SurveyConnection {
  return {
    surveyId: 's1',
    characterId: 1,
    payeeId: 'p1',
    payeeName: 'Moon Corp',
    taxPct: 10,
    systemId: 30000142,
    typeIds: [45492],
    fromDate: '2026-10-21',
    untilMs: NOW + 3_600_000,
    expiresAt: NOW + 86_400_000,
    connectedAt: NOW,
    ...overrides,
  };
}

function renderPanel() {
  return render(
    <AutoAssignmentBar
      characterIds={[1]}
      characterNames={new Map([[1, 'Pilot']])}
      systemNames={new Map([[30000142, 'Jita']])}
      nowMs={NOW}
    />
  );
}

describe('AutoAssignmentBar', () => {
  beforeEach(() => {
    useSurveyConnections.setState({ hydrated: true });
  });
  afterEach(() => {
    cleanup();
    useSurveyConnections.setState({ value: [] });
  });

  it('shows nothing with no live connection', () => {
    useSurveyConnections.setState({ value: [] });
    const { container } = renderPanel();
    expect(container.textContent).toBe('');
  });

  it('is one Auto Assignment row: payee at rate · system · until, then Stop', async () => {
    useSurveyConnections.setState({ value: [connection()] });
    renderPanel();
    const bar = screen.getByRole('status', { name: 'Auto Assignment' });
    expect(bar.textContent).toMatch(/^Auto AssignmentMoon Corp at 10% · Jita · until .+Stop$/);
    expect(screen.queryByText(/Bitumens/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    await waitFor(() => expect(useSurveyConnections.getState().value).toEqual([]));
  });

  it('names the Character only when more than one is tracked', () => {
    useSurveyConnections.setState({ value: [connection()] });
    render(
      <AutoAssignmentBar
        characterIds={[1, 2]}
        characterNames={new Map([[1, 'Pilot']])}
        systemNames={new Map([[30000142, 'Jita']])}
        nowMs={NOW}
      />
    );
    expect(screen.getByRole('status').textContent).toContain(' · Pilot');
  });
});
