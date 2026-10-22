import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { db } from '@/db';
import { useCharacterFilterPicks } from '@/features/character/characterFilterPicks';
import { useDefaultCharacterFilter } from '@/features/character/defaultCharacterFilter';
import {
  industryCharacterPick,
  linkedIndustryCharacterFilter,
  useIndustryCharacterFilter,
} from './industryCharacterFilter';

describe('linkedIndustryCharacterFilter', () => {
  it('reads nothing from a URL without a Character filter', () => {
    expect(linkedIndustryCharacterFilter('?tab=plans')).toBeNull();
  });

  it('reads the page-wide param', () => {
    expect(linkedIndustryCharacterFilter('?industry.chars=all')).toBe('all');
  });

  it("still opens an old Active Jobs link's filter", () => {
    expect(linkedIndustryCharacterFilter('?jobs.chars=all')).toBe('all');
  });

  it("still opens an old Opportunities link's filter", () => {
    expect(linkedIndustryCharacterFilter('?opps.chars=all')).toBe('all');
  });

  it('prefers the page-wide param over either old one', () => {
    expect(
      linkedIndustryCharacterFilter('?industry.chars=current&jobs.chars=all&opps.chars=all')
    ).toBe('current');
  });

  it("prefers the old Active Jobs param over the old Opportunities one (Jobs' picker showed on every tab)", () => {
    expect(linkedIndustryCharacterFilter('?jobs.chars=current&opps.chars=all')).toBe('current');
  });

  it('reads a legacy id list as All, like every Character filter param', () => {
    expect(linkedIndustryCharacterFilter('?jobs.chars=91,92')).toBe('all');
  });
});

describe('industryCharacterPick', () => {
  it('falls back to the Settings default with no pick', () => {
    expect(industryCharacterPick({}, 'all')).toBe('all');
  });

  it("uses Industry's own pick first", () => {
    expect(industryCharacterPick({ industry: 'current', jobs: 'all' }, 'all')).toBe('current');
  });

  it('carries over the old Active Jobs pick, then the old Opportunities one', () => {
    expect(industryCharacterPick({ jobs: 'all', opportunities: 'current' }, 'current')).toBe('all');
    expect(industryCharacterPick({ opportunities: 'all' }, 'current')).toBe('all');
  });
});

function useProbe() {
  const jobs = useIndustryCharacterFilter();
  const opportunities = useIndustryCharacterFilter();
  const { search } = useLocation();
  return { jobs, opportunities, search };
}

function wrapper(url: string) {
  return ({ children }: { children: ReactNode }) =>
    createElement(MemoryRouter, { initialEntries: [url] }, children);
}

describe('useIndustryCharacterFilter', () => {
  beforeEach(async () => {
    await db.settings.clear();
    useCharacterFilterPicks.setState({ value: {}, hydrated: false });
    useDefaultCharacterFilter.setState({ value: 'current', hydrated: false });
  });

  it('opens on the synced Settings default', async () => {
    useDefaultCharacterFilter.setState({ value: 'all', hydrated: true });
    const { result } = renderHook(useProbe, { wrapper: wrapper('/industry') });
    await waitFor(() => expect(result.current.jobs[0]).toBe('all'));
    expect(result.current.opportunities[0]).toBe('all');
  });

  it('one change drives every consumer, writes the page-wide param and drops the old ones', async () => {
    const { result } = renderHook(useProbe, {
      wrapper: wrapper('/industry?opps.chars=current&jobs.chars=current&tab=opportunities'),
    });
    act(() => result.current.opportunities[1]('all'));
    await waitFor(() => expect(result.current.jobs[0]).toBe('all'));
    expect(result.current.opportunities[0]).toBe('all');
    const params = new URLSearchParams(result.current.search);
    expect(params.get('industry.chars')).toBe('all');
    expect(params.has('jobs.chars')).toBe(false);
    expect(params.has('opps.chars')).toBe(false);
    expect(params.get('tab')).toBe('opportunities');
    await waitFor(() =>
      expect(useCharacterFilterPicks.getState().value).toEqual({ industry: 'all' })
    );
  });

  it('a link wins over the remembered pick and is not remembered', async () => {
    await db.settings.put({ key: 'characterFilterPicks', value: { industry: 'current' } });
    const { result } = renderHook(useProbe, { wrapper: wrapper('/industry?jobs.chars=all') });
    await waitFor(() => expect(useCharacterFilterPicks.getState().hydrated).toBe(true));
    expect(result.current.jobs[0]).toBe('all');
    expect(useCharacterFilterPicks.getState().value).toEqual({ industry: 'current' });
  });

  it('picking back the remembered value clears an old link param too', async () => {
    await db.settings.put({ key: 'characterFilterPicks', value: { industry: 'current' } });
    const { result } = renderHook(useProbe, { wrapper: wrapper('/industry?opps.chars=all') });
    await waitFor(() => expect(useCharacterFilterPicks.getState().hydrated).toBe(true));
    act(() => result.current.jobs[1]('current'));
    await waitFor(() => expect(result.current.jobs[0]).toBe('current'));
    const params = new URLSearchParams(result.current.search);
    expect(params.has('opps.chars')).toBe(false);
    // The remembered pick is what an absent param already means.
    expect(params.has('industry.chars')).toBe(false);
  });

  it('writes no param when the pick is the remembered one', async () => {
    await db.settings.put({ key: 'characterFilterPicks', value: { industry: 'all' } });
    const { result } = renderHook(useProbe, {
      wrapper: wrapper('/industry?industry.chars=current&tab=plans'),
    });
    await waitFor(() => expect(useCharacterFilterPicks.getState().hydrated).toBe(true));
    expect(result.current.jobs[0]).toBe('current');
    act(() => result.current.jobs[1]('all'));
    await waitFor(() => expect(result.current.opportunities[0]).toBe('all'));
    const params = new URLSearchParams(result.current.search);
    expect(params.has('industry.chars')).toBe(false);
    expect(params.get('tab')).toBe('plans');
  });
});
