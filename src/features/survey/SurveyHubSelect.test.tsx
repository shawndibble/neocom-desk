import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import { usePageHubs } from '@/features/market/pageHubs';
import { resetHubStores } from '@/test/hubStores';
import { SurveyHubSelect } from './SurveyHubSelect';

afterEach(async () => {
  cleanup();
  await db.settings.clear();
  resetHubStores();
});

describe('SurveyHubSelect', () => {
  it("shows Mining's own hub over the Global hub", async () => {
    await db.settings.bulkPut([
      { key: 'sync.marketHub', value: 'amarr' },
      { key: 'sync.pageHubs', value: { mining: 'jita' } },
    ]);
    render(<SurveyHubSelect />);
    expect(
      await screen.findByRole('button', { name: 'Jita, Price ore at market hub' })
    ).toHaveTextContent('Jita');
  });

  it("writes a pick to Mining's own hub when it has one", async () => {
    await db.settings.put({ key: 'sync.pageHubs', value: { mining: 'jita' } });
    const user = userEvent.setup();
    render(<SurveyHubSelect />);
    await user.click(await screen.findByRole('button', { name: /Price ore at market hub$/ }));
    await user.click(await screen.findByRole('menuitemradio', { name: /^Amarr/ }));
    await waitFor(() => expect(usePageHubs.getState().value).toEqual({ mining: 'amarr' }));
  });
});
