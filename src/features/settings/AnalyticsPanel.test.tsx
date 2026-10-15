import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import { useAnalyticsEnabled } from '@/app/analyticsPref';
import { AnalyticsPanel } from './AnalyticsPanel';

beforeEach(async () => {
  await db.settings.delete('analyticsEnabled');
  useAnalyticsEnabled.setState({ value: true, hydrated: false });
});

describe('AnalyticsPanel', () => {
  it('is on by default and writes the device-local row when turned off', async () => {
    const user = userEvent.setup();
    render(<AnalyticsPanel />);
    const box = await screen.findByRole('checkbox', { name: /send page views/i });
    expect(box).toBeChecked();

    await user.click(box);
    expect(box).not.toBeChecked();
    await waitFor(async () =>
      expect((await db.settings.get('analyticsEnabled'))?.value).toBe(false)
    );
  });

  it('shows a stored off choice', async () => {
    await db.settings.put({ key: 'analyticsEnabled', value: false });
    render(<AnalyticsPanel />);
    expect(await screen.findByRole('checkbox', { name: /send page views/i })).not.toBeChecked();
  });
});
