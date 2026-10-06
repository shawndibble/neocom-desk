import { describe, expect, it } from 'vitest';
import { legacyLocation } from './legacyPaths';

describe('legacyLocation', () => {
  it('moves the LP Store landing and a picked store under Market, keeping the corporation', () => {
    expect(legacyLocation('/wallet/loyalty', '', '')).toEqual({
      pathname: '/market/lp-store',
      search: '',
      hash: '',
    });
    expect(legacyLocation('/wallet/loyalty/1000125', '?sort=lp', '#top')).toEqual({
      pathname: '/market/lp-store/1000125',
      search: '?sort=lp',
      hash: '#top',
    });
  });

  it('sends Travel › Pilot Lookup to its own page with the query intact', () => {
    expect(legacyLocation('/travel/pilot', '?pilot=90000001', '').pathname).toBe('/pilot-lookup');
    expect(legacyLocation('/travel/pilot', '?pilot=90000001', '').search).toBe('?pilot=90000001');
  });

  it('sends Settings › FAQ and Settings › Help to the Help page', () => {
    expect(legacyLocation('/settings/faq', '', '').pathname).toBe('/help/faq');
    expect(legacyLocation('/settings/help', '', '').pathname).toBe('/help/support');
  });

  it('sends the retired PI Advisor tab to Colonies, dropping its retired ?system', () => {
    expect(legacyLocation('/planetary-industry/advisor', '?system=30000142', '')).toEqual({
      pathname: '/planetary-industry/colonies',
      search: '',
      hash: '',
    });
    expect(
      legacyLocation('/planetary-industry/advisor', '?system=30000142&character=7', '#x')
    ).toEqual({
      pathname: '/planetary-industry/colonies',
      search: '?character=7',
      hash: '#x',
    });
  });

  it('leaves a path it does not know alone', () => {
    expect(legacyLocation('/market/browser', '?q=1', '')).toEqual({
      pathname: '/market/browser',
      search: '?q=1',
      hash: '',
    });
  });

  it('does not match a path that only shares a prefix string', () => {
    expect(legacyLocation('/wallet/loyaltyish', '', '').pathname).toBe('/wallet/loyaltyish');
  });
});
