import { describe, it, expect, beforeEach } from 'vitest';
import { openPublicInfoModal, usePublicInfoModalStore } from './publicInfoModal';

beforeEach(() => {
  usePublicInfoModalStore.setState({ request: null });
});

describe('usePublicInfoModalStore', () => {
  it('starts closed', () => {
    expect(usePublicInfoModalStore.getState().request).toBeNull();
  });

  it('open() records the kind and id to show', () => {
    usePublicInfoModalStore.getState().open('character', 91);
    expect(usePublicInfoModalStore.getState().request).toEqual({ kind: 'character', id: 91 });
  });

  it('a later open() replaces the previous request', () => {
    usePublicInfoModalStore.getState().open('character', 91);
    usePublicInfoModalStore.getState().open('corporation', 2);
    expect(usePublicInfoModalStore.getState().request).toEqual({ kind: 'corporation', id: 2 });
  });

  it('close() clears the request', () => {
    usePublicInfoModalStore.getState().open('alliance', 3);
    usePublicInfoModalStore.getState().close();
    expect(usePublicInfoModalStore.getState().request).toBeNull();
  });

  it('openPublicInfoModal() is the non-React equivalent of open()', () => {
    openPublicInfoModal('corporation', 7);
    expect(usePublicInfoModalStore.getState().request).toEqual({ kind: 'corporation', id: 7 });
  });
});
