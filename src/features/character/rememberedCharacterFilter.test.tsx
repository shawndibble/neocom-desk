import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { db } from '@/db';
import { useRememberedUrlParams } from '@/lib/useUrlState';
import { characterFilterParam } from './characterFilterUrlParam';
import { useCharacterFilterPicks, useRememberedCharacterFilter } from './characterFilterPicks';
import { useDefaultCharacterFilter } from './defaultCharacterFilter';

const PARAMS = { chars: characterFilterParam('current') };

function useFilter(page: 'assets' | 'wallet' | 'miningTax', firstVisit?: 'current' | 'all') {
  const remembered = useRememberedCharacterFilter<typeof PARAMS>(page, 'chars', firstVisit);
  const [values, setValues] = useRememberedUrlParams(PARAMS, remembered);
  return { value: values.chars, set: (chars: 'current' | 'all') => setValues({ chars }) };
}

function wrapper(url: string) {
  return ({ children }: { children: ReactNode }) =>
    createElement(MemoryRouter, { initialEntries: [url] }, children);
}

describe('remembered character filter precedence', () => {
  beforeEach(async () => {
    await db.settings.clear();
    useCharacterFilterPicks.setState({ value: {}, hydrated: false });
    useDefaultCharacterFilter.setState({ value: 'current', hydrated: false });
  });

  it('first visit uses the Settings default', async () => {
    useDefaultCharacterFilter.setState({ value: 'all' });
    const { result } = renderHook(() => useFilter('assets'), { wrapper: wrapper('/') });
    await waitFor(() => expect(result.current.value).toBe('all'));
  });

  it("a page's own first-visit value beats the Settings default", async () => {
    const { result } = renderHook(() => useFilter('miningTax', 'all'), { wrapper: wrapper('/') });
    await waitFor(() => expect(useDefaultCharacterFilter.getState().hydrated).toBe(true));
    expect(result.current.value).toBe('all');
  });

  it("a page's remembered pick beats its first-visit value", async () => {
    await db.settings.put({ key: 'characterFilterPicks', value: { miningTax: 'current' } });
    const { result } = renderHook(() => useFilter('miningTax', 'all'), { wrapper: wrapper('/') });
    await waitFor(() => expect(result.current.value).toBe('current'));
  });

  it("a page's remembered pick beats the Settings default", async () => {
    await db.settings.put({ key: 'characterFilterPicks', value: { assets: 'current' } });
    useDefaultCharacterFilter.setState({ value: 'all' });
    const { result } = renderHook(() => useFilter('assets'), { wrapper: wrapper('/') });
    await waitFor(() => expect(result.current.value).toBe('current'));
  });

  it('a URL value beats the remembered pick and does not overwrite it', async () => {
    await db.settings.put({ key: 'characterFilterPicks', value: { assets: 'current' } });
    const { result } = renderHook(() => useFilter('assets'), { wrapper: wrapper('/?chars=all') });
    await waitFor(() => expect(useCharacterFilterPicks.getState().hydrated).toBe(true));
    expect(result.current.value).toBe('all');
    expect(useCharacterFilterPicks.getState().value).toEqual({ assets: 'current' });
  });

  it("a change before hydration keeps the other pages' picks", async () => {
    await db.settings.put({ key: 'characterFilterPicks', value: { wallet: 'all' } });
    const { result } = renderHook(() => useFilter('assets'), { wrapper: wrapper('/') });
    act(() => result.current.set('all'));
    await waitFor(() =>
      expect(useCharacterFilterPicks.getState().value).toEqual({ wallet: 'all', assets: 'all' })
    );
  });

  it('a change is remembered for its own page only', async () => {
    const assets = renderHook(() => useFilter('assets'), { wrapper: wrapper('/') });
    await waitFor(() => expect(useCharacterFilterPicks.getState().hydrated).toBe(true));
    act(() => assets.result.current.set('all'));
    await waitFor(() =>
      expect(useCharacterFilterPicks.getState().value).toEqual({ assets: 'all' })
    );

    const wallet = renderHook(() => useFilter('wallet'), { wrapper: wrapper('/') });
    await waitFor(() => expect(wallet.result.current.value).toBe('current'));
    const again = renderHook(() => useFilter('assets'), { wrapper: wrapper('/') });
    await waitFor(() => expect(again.result.current.value).toBe('all'));
  });
});
