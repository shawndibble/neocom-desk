import { describe, it, expect, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, useState, type ReactNode } from 'react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { decodeAppraisalList, encodeAppraisalList } from '@/engine/market/appraisalListCode';
import { useAppraisalListUrl } from './useAppraisalListUrl';

function setup(initial: string, active = true) {
  const appraiseText = vi.fn();
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(MemoryRouter, { initialEntries: [initial] }, children);
  const view = renderHook(
    () => {
      const [submitted, setSubmitted] = useState('');
      const [text, setText] = useState('');
      const location = useLocation();
      const navigate = useNavigate();
      useAppraisalListUrl(
        {
          submitted,
          text,
          appraiseText: (next) => {
            appraiseText(next);
            setSubmitted(next);
          },
        },
        active
      );
      return { setSubmitted, setText, location, navigate };
    },
    { wrapper }
  );
  return { view, appraiseText };
}

const listOf = (search: string) => new URLSearchParams(search).get('list');

describe('useAppraisalListUrl', () => {
  it('writes ?list= when a list is submitted and removes it on Clear', async () => {
    const { view } = setup('/market/appraisal?hub=jita');
    act(() => view.result.current.setSubmitted('Tritanium 5'));
    await waitFor(() => expect(listOf(view.result.current.location.search)).not.toBeNull());
    expect(view.result.current.location.search).toContain('hub=jita');
    const decoded = await decodeAppraisalList(listOf(view.result.current.location.search)!);
    expect(decoded).toEqual({ ok: true, text: 'Tritanium 5' });

    act(() => view.result.current.setSubmitted(''));
    await waitFor(() => expect(listOf(view.result.current.location.search)).toBeNull());
    expect(view.result.current.location.search).toContain('hub=jita');
  });

  it('does not touch the URL when only the box text changes', async () => {
    const { view } = setup('/market/appraisal');
    act(() => view.result.current.setText('Pyerite 9'));
    await new Promise((r) => setTimeout(r, 20));
    expect(view.result.current.location.search).toBe('');
  });

  it('appraises a valid ?list= on arrival, once', async () => {
    const encoded = await encodeAppraisalList('Mexallon 12\nIsogen 3');
    if (!encoded.ok) throw new Error('encode failed');
    const { view, appraiseText } = setup(`/market/appraisal?list=${encoded.code}`);
    await waitFor(() => expect(appraiseText).toHaveBeenCalledWith('Mexallon 12\nIsogen 3'));
    await new Promise((r) => setTimeout(r, 20));
    expect(appraiseText).toHaveBeenCalledTimes(1);
    expect(listOf(view.result.current.location.search)).toBe(encoded.code);
  });

  it('strips an invalid ?list= and appraises nothing', async () => {
    const { view, appraiseText } = setup('/market/appraisal?list=9.garbage&hub=jita');
    await waitFor(() => expect(listOf(view.result.current.location.search)).toBeNull());
    expect(view.result.current.location.search).toContain('hub=jita');
    expect(appraiseText).not.toHaveBeenCalled();
  });

  it('leaves the URL alone for a list over the length limit', async () => {
    const { view } = setup('/market/appraisal');
    const noisy = Array.from({ length: 3000 }, (_, i) => `Item ${i * 7919 + 13} ${i ** 3}`).join(
      '\n'
    );
    expect((await encodeAppraisalList(noisy)).ok).toBe(false);
    act(() => view.result.current.setSubmitted(noisy));
    await new Promise((r) => setTimeout(r, 50));
    expect(view.result.current.location.search).toBe('');
  });

  it('does not overwrite a list already appraised this visit', async () => {
    const encoded = await encodeAppraisalList('Zydrine 1');
    if (!encoded.ok) throw new Error('encode failed');
    const { view, appraiseText } = setup('/market/appraisal');
    act(() => view.result.current.setSubmitted('Tritanium 5'));
    await waitFor(() => expect(listOf(view.result.current.location.search)).not.toBeNull());
    act(() => view.result.current.navigate(`/market/appraisal?list=${encoded.code}`));
    await new Promise((r) => setTimeout(r, 30));
    expect(appraiseText).not.toHaveBeenCalled();
  });

  it('strips an invalid ?list= even when the visit already has a list', async () => {
    const { view } = setup('/market/appraisal');
    act(() => view.result.current.setSubmitted('Tritanium 5'));
    await waitFor(() => expect(listOf(view.result.current.location.search)).not.toBeNull());
    act(() => view.result.current.navigate('/market/appraisal?list=9.garbage'));
    await waitFor(() => expect(listOf(view.result.current.location.search)).toBeNull());
  });

  it('writes nothing while another Market tab is showing', async () => {
    const { view } = setup('/market/browser', false);
    act(() => view.result.current.setSubmitted('Tritanium 5'));
    await new Promise((r) => setTimeout(r, 50));
    expect(view.result.current.location.search).toBe('');
  });
});
