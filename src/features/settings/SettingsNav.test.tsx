import { beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { SettingsIndex, SettingsNav } from './SettingsNav';
import { useStorageAtRisk } from './storageAtRisk';
import type { SettingsGroup } from './sections';

const GROUPS: readonly SettingsGroup[] = [
  { id: 'data', labelKey: 'settings.groups.data', sections: ['offline'] },
];

beforeEach(() => {
  useStorageAtRisk.setState({ atRisk: false });
});

describe('Offline data attention dot', () => {
  it('marks the rail entry while the installed app is unprotected, and clears', () => {
    useStorageAtRisk.setState({ atRisk: true });
    render(
      <MemoryRouter>
        <SettingsNav groups={GROUPS} value="offline" />
      </MemoryRouter>
    );
    expect(screen.getByRole('img', { name: 'Data not protected' })).toBeInTheDocument();
    act(() => useStorageAtRisk.setState({ atRisk: false }));
    expect(screen.queryByRole('img', { name: 'Data not protected' })).not.toBeInTheDocument();
  });

  it('marks the phone index row too', () => {
    useStorageAtRisk.setState({ atRisk: true });
    render(
      <MemoryRouter>
        <SettingsIndex groups={GROUPS} summaries={{}} />
      </MemoryRouter>
    );
    expect(screen.getByRole('img', { name: 'Data not protected' })).toBeInTheDocument();
  });

  it('shows nothing when storage is not at risk', () => {
    render(
      <MemoryRouter>
        <SettingsNav groups={GROUPS} value="offline" />
      </MemoryRouter>
    );
    expect(screen.queryByRole('img', { name: 'Data not protected' })).not.toBeInTheDocument();
  });
});
