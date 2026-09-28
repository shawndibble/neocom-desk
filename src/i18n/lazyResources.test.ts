import { describe, expect, it, vi } from 'vitest';

describe('lazyResources', () => {
  it('holds resources registered before i18next is ready, then hands them over in order', async () => {
    vi.resetModules();
    const { addLazyResources, connectLazyResources } = await import('./lazyResources');
    addLazyResources({ market: { title: 'Market' } });
    addLazyResources({ industry: { title: 'Industry' } });
    const sink = vi.fn();
    connectLazyResources(sink);
    expect(sink.mock.calls).toEqual([
      [{ market: { title: 'Market' } }],
      [{ industry: { title: 'Industry' } }],
    ]);
  });

  it('passes resources registered after connecting straight through', async () => {
    vi.resetModules();
    const { addLazyResources, connectLazyResources } = await import('./lazyResources');
    const sink = vi.fn();
    connectLazyResources(sink);
    addLazyResources({ market: { title: 'Market' } });
    expect(sink).toHaveBeenCalledOnce();
    expect(sink).toHaveBeenCalledWith({ market: { title: 'Market' } });
  });

  it('merges into the one translation namespace without overwriting a shell key', async () => {
    vi.resetModules();
    const { default: i18n } = await import('./index');
    const { addLazyResources } = await import('./lazyResources');
    const shellSave = i18n.t('common.save');
    addLazyResources({
      common: { save: 'overwritten' },
      zzLazyProbe: { nested: { key: 'Loaded' } },
    });
    expect(i18n.t('zzLazyProbe.nested.key')).toBe('Loaded');
    expect(i18n.t('common.save')).toBe(shellSave);
  });
});
