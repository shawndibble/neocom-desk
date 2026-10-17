import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import { SurveyHubSelect } from './SurveyHubSelect';
import { useSurveyPriceHub } from './surveyPref';

afterEach(async () => {
  cleanup();
  await db.settings.clear();
  useSurveyPriceHub.setState({ value: 'jita', hydrated: false });
});

describe('SurveyHubSelect', () => {
  it('shows Jita until the pilot picks a hub, whatever their default Trade Hub', async () => {
    await db.settings.put({ key: 'sync.marketHub', value: 'amarr' });
    render(<SurveyHubSelect />);
    expect(
      await screen.findByRole('combobox', { name: 'Price ore at market hub' })
    ).toHaveTextContent('Jita');
  });

  it('remembers the pick in the browser', async () => {
    const user = userEvent.setup();
    render(<SurveyHubSelect />);
    await user.click(await screen.findByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Amarr' }));
    await waitFor(async () =>
      expect((await db.settings.get('miningSurveyPriceHub'))?.value).toBe('amarr')
    );
  });
});
