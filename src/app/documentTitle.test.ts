import { describe, it, expect } from 'vitest';
import i18n from '@/i18n';
import { documentTitleFor } from './documentTitle';
import { ROUTE_REQUIREMENTS, type AppRoutePath } from './routeScopes';

const t = (key: string) => i18n.t(key);

describe('documentTitleFor', () => {
  it('names the page, then the app', () => {
    expect(documentTitleFor('/overview', t)).toBe('Overview — Neocom Desk');
    expect(documentTitleFor('/mail', t)).toBe('Mail — Neocom Desk');
  });

  it('changes between two routes', () => {
    expect(documentTitleFor('/overview', t)).not.toBe(documentTitleFor('/assets', t));
  });

  it('puts a tabbed page’s tab before the page', () => {
    expect(documentTitleFor('/market/orders', t)).toBe(
      `${i18n.t('market.sections.openOrders')} — Market — Neocom Desk`
    );
    expect(documentTitleFor('/market/history/transactions', t)).toBe(
      `${i18n.t('market.sections.transactions')} — Market — Neocom Desk`
    );
    expect(documentTitleFor('/settings/faq', t)).toBe(
      `${i18n.t('settings.tabs.faq')} — Settings — Neocom Desk`
    );
  });

  it('titles a tabbed page’s bare path as the page alone', () => {
    expect(documentTitleFor('/market', t)).toBe('Market — Neocom Desk');
  });

  it('does not repeat a tab label that matches its page', () => {
    // Market's Browser tab is labelled "Market".
    expect(documentTitleFor('/market/browser', t)).toBe('Market — Neocom Desk');
  });

  it('names a nested route by its section, not the tabbed page it sits under', () => {
    expect(documentTitleFor('/industry/plans/abc', t)).toBe(
      `${i18n.t('industry.buildPlansTab')} — ${i18n.t('nav.industry')} — Neocom Desk`
    );
    expect(documentTitleFor('/skills/plans/42', t)).toBe(
      `${i18n.t('skills.plansTab')} — ${i18n.t('nav.skills')} — Neocom Desk`
    );
  });

  it('covers splat routes', () => {
    expect(documentTitleFor('/assets/60003760', t)).toBe('Assets — Neocom Desk');
  });

  it('falls back to Page not found for an unknown path', () => {
    expect(documentTitleFor('/no-such-page', t)).toBe(`${i18n.t('notFound.title')} — Neocom Desk`);
  });

  it('gives every feature route a distinct title', () => {
    const concrete = (Object.keys(ROUTE_REQUIREMENTS) as AppRoutePath[])
      // Redirect-only routes never render a page of their own.
      .filter((path) => path !== '/skills' && path !== '/bpc-contracts')
      .map((path) => path.replace(/:\w+/g, '1').replace('/*', '/x'))
      // `/assets/x` is the same page as `/assets`, one drill-down deeper.
      .filter((path) => !path.endsWith('/x'));
    const titles = concrete.map((path) => documentTitleFor(path, t));
    for (const title of titles) expect(title).not.toContain(i18n.t('notFound.title'));
    // Nested :param routes share their section's title by design.
    const nested = new Set(['/skills/plans/1', '/industry/plans/1', '/industry/groups/1']);
    const distinct = concrete
      .filter((path) => !nested.has(path))
      .map((p) => documentTitleFor(p, t));
    expect(new Set(distinct).size).toBe(distinct.length);
  });
});

describe('documentTitleFor Settings index', () => {
  it('titles the bare /settings list as Settings', () => {
    expect(documentTitleFor('/settings', t)).toBe('Settings — Neocom Desk');
  });
});
