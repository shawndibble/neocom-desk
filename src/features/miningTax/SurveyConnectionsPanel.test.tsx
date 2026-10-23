import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@/i18n';
import type { SurveyConnection } from '@/engine/miningTax/surveyConnection';
import { SurveyConnectionsPanel } from './SurveyConnectionsPanel';
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
    <SurveyConnectionsPanel
      characterIds={[1]}
      characterNames={new Map([[1, 'Pilot']])}
      systemNames={new Map([[30000142, 'Jita']])}
      typeNames={new Map([[45492, 'Bitumens']])}
      nowMs={NOW}
    />
  );
}

describe('SurveyConnectionsPanel', () => {
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

  it('names the payee, system and ore, and Stop removes it', async () => {
    useSurveyConnections.setState({ value: [connection()] });
    renderPanel();
    expect(screen.getByText('Moon Corp at 10%')).toBeTruthy();
    expect(screen.getByText(/Jita · Bitumens/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    await waitFor(() => expect(useSurveyConnections.getState().value).toEqual([]));
  });

  it('warns when two payees claim the same ore in one system', () => {
    useSurveyConnections.setState({
      value: [connection(), connection({ surveyId: 's2', payeeId: 'p2', payeeName: 'Other Corp' })],
    });
    renderPanel();
    expect(screen.getByText(/Shares ore with the survey for Other Corp/)).toBeTruthy();
    expect(screen.getByText(/Shares ore with the survey for Moon Corp/)).toBeTruthy();
  });
});
