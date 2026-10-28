import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { db } from '@/db';
import '@/i18n';
import { EveNotificationBadge, MailPushBadge, NearbyPushBadge } from './ScheduledPushBadge';

vi.mock('@/app/syncStatus', () => ({ isSyncConfigured: () => true }));

beforeEach(async () => {
  await db.settings.clear();
});

const MISSING = /^Needs Alerts when closed/;

describe('NearbyPushBadge', () => {
  it('flags the missing grant while no Character’s grant carries the location', async () => {
    await db.settings.put({ key: 'alertsNearby', value: { supported: true, characterIds: [] } });
    render(<NearbyPushBadge />);
    expect(
      await screen.findByRole('img', { name: /Needs Alerts when closed with location/ })
    ).toBeInTheDocument();
  });

  it('shows nothing while the server does not take the scope at all', async () => {
    await db.settings.put({ key: 'alertsNearby', value: { supported: false, characterIds: [] } });
    const { container } = render(<NearbyPushBadge />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(container).toBeEmptyDOMElement();
  });

  it('marks the row as arriving with the app closed once one does', async () => {
    await db.settings.put({ key: 'alertsNearby', value: { supported: true, characterIds: [1] } });
    render(<NearbyPushBadge />);
    expect(
      await screen.findByRole('img', {
        name: /Arrives even with the app closed, within about 15 minutes/,
      })
    ).toBeInTheDocument();
  });
});

describe('MailPushBadge', () => {
  it('flags the missing grant, then marks the row once a grant carries mail', async () => {
    await db.settings.put({ key: 'alertsMail', value: { supported: true, characterIds: [] } });
    render(<MailPushBadge />);
    expect(
      await screen.findByRole('img', { name: /Needs Alerts when closed with mail/ })
    ).toBeInTheDocument();
    await db.settings.put({ key: 'alertsMail', value: { supported: true, characterIds: [1] } });
    expect(await screen.findByRole('img', { name: /includes mail/ })).toBeInTheDocument();
  });
});

describe('EveNotificationBadge', () => {
  it('flags the missing grant while no Character has Alerts when closed on', async () => {
    render(<EveNotificationBadge />);
    expect(await screen.findByRole('img', { name: MISSING })).toBeInTheDocument();
  });

  it('marks the row once a Character has an active grant', async () => {
    await db.settings.put({
      key: 'alertsGrants',
      value: { 1: { status: 'active', enabledAt: 1 } },
    });
    render(<EveNotificationBadge />);
    expect(
      await screen.findByRole('img', { name: /Arrives even with the app closed/ })
    ).toBeInTheDocument();
  });

  it('counts a grant that needs re-authorizing as missing', async () => {
    await db.settings.put({
      key: 'alertsGrants',
      value: { 1: { status: 'needs-reauth', enabledAt: 1 } },
    });
    render(<EveNotificationBadge />);
    expect(await screen.findByRole('img', { name: MISSING })).toBeInTheDocument();
  });

  it('with onlyWhenMissing shows nothing once the grant is there', async () => {
    await db.settings.put({
      key: 'alertsGrants',
      value: { 1: { status: 'active', enabledAt: 1 } },
    });
    const { container } = render(<EveNotificationBadge onlyWhenMissing />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(container).toBeEmptyDOMElement();
  });
});
