import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import { DEFAULT_SURVEY_CHAT_OPTIONS } from '@/engine/survey/chatMessage';
import { summarizeSurvey } from '@/engine/survey/series';
import i18n from '@/i18n';
import { SurveyChatDialog } from './SurveyChatDialog';
import { useSurveyChatOptions } from './surveyPref';

const T0 = Date.UTC(2026, 9, 8, 16, 40, 0);
const scan = (minutes: number, volume: number) => ({
  at: T0 + minutes * 60_000,
  rocks: [{ ore: 'Scordite', volume }],
});
const labels = {
  heading: i18n.t('survey.message.heading'),
  done: i18n.t('survey.message.done'),
  waiting: i18n.t('survey.message.waiting'),
  left: i18n.t('survey.message.left'),
  more: i18n.t('survey.message.more'),
  cleared: i18n.t('survey.message.cleared'),
  location: i18n.t('survey.message.location'),
  pace: i18n.t('survey.message.pace'),
  percent: i18n.t('survey.message.percent'),
  value: i18n.t('survey.message.value'),
  volume: i18n.t('survey.message.volume'),
  elapsed: i18n.t('survey.message.elapsed'),
};

function open(scans = [scan(0, 2000), scan(10, 1500)], location: string | null = 'Efa IV') {
  render(
    <SurveyChatDialog
      summary={summarizeSurvey(scans)!}
      url="https://neocomdesk.test/s/abc"
      labels={labels}
      now={T0 + 10 * 60_000}
      location={location}
      onClose={() => {}}
    />
  );
}

afterEach(async () => {
  cleanup();
  await db.settings.clear();
  useSurveyChatOptions.setState({ value: DEFAULT_SURVEY_CHAT_OPTIONS, hydrated: false });
});

describe('SurveyChatDialog', () => {
  it('previews the message and updates it as options change', async () => {
    const user = userEvent.setup();
    open();
    const preview = await screen.findByTestId('chat-preview');
    expect(preview).toHaveTextContent('Neocom Desk Report');
    expect(preview).toHaveTextContent('┌');
    expect(preview).toHaveTextContent('█');

    await user.click(screen.getByRole('button', { name: /Double/ }));
    expect(preview).toHaveTextContent('╔');
    await user.click(screen.getByRole('checkbox', { name: /^Border/ }));
    expect(preview).not.toHaveTextContent('╔');
    expect(preview).not.toHaveTextContent('┌');
    await user.click(screen.getByRole('checkbox', { name: /^Border/ }));
    expect(preview).toHaveTextContent('╔');
    await user.click(screen.getByRole('checkbox', { name: /Progress bar/ }));
    expect(preview).not.toHaveTextContent('█');
    await user.click(screen.getByRole('checkbox', { name: /Location/ }));
    expect(preview).toHaveTextContent('[ Efa IV ]');
  });

  it('remembers the choices in the browser', async () => {
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('checkbox', { name: /^Border/ }));
    await waitFor(async () =>
      expect(
        ((await db.settings.get('miningSurveyChatOptions'))?.value as { border: string }).border
      ).toBe('none')
    );
  });

  it('disables the bar with a single scan and the location without one', async () => {
    open([scan(0, 2000)], null);
    expect(await screen.findByRole('checkbox', { name: /Progress bar/ })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: /Location/ })).toBeDisabled();
    expect(screen.getByTestId('chat-preview')).not.toHaveTextContent('█');
  });
});
