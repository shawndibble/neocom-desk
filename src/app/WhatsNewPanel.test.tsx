import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import { WhatsNewPanel } from './WhatsNewPanel';
import { useLastSeenVersion, LAST_SEEN_VERSION_KEY } from './lastSeenVersion';
import { changelog } from './changelog';

const currentVersion = changelog[0].version;

beforeEach(async () => {
  await db.settings.clear();
  // Singleton store (createLocalSetting is called once at module scope) —
  // reset it directly so one test's hydration doesn't leak into the next.
  useLastSeenVersion.setState({ value: null, hydrated: false });
});

describe('WhatsNewPanel', () => {
  it('renders nothing and silently records the version on a fresh install', async () => {
    render(<WhatsNewPanel />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(async () => {
      expect((await db.settings.get(LAST_SEEN_VERSION_KEY))?.value).toBe(currentVersion);
    });
  });

  it('renders nothing when the recorded version already matches the current version', async () => {
    await db.settings.put({ key: LAST_SEEN_VERSION_KEY, value: currentVersion });

    render(<WhatsNewPanel />);

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('shows the panel with the unseen entries when an older version was recorded', async () => {
    await db.settings.put({ key: LAST_SEEN_VERSION_KEY, value: 'some-old-version' });

    render(<WhatsNewPanel />);

    expect(await screen.findByRole('dialog')).toHaveTextContent(changelog[0].items[0]);
  });

  it('dismisses and records the current version as seen', async () => {
    await db.settings.put({ key: LAST_SEEN_VERSION_KEY, value: 'some-old-version' });
    const user = userEvent.setup();

    render(<WhatsNewPanel />);
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: /got it/i }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(async () => {
      expect((await db.settings.get(LAST_SEEN_VERSION_KEY))?.value).toBe(currentVersion);
    });
  });
});
