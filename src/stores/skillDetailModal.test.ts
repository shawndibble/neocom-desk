import { describe, it, expect, beforeEach } from 'vitest';
import { openSkillDetailModal, useSkillDetailModalStore } from './skillDetailModal';

beforeEach(() => {
  useSkillDetailModalStore.setState({ request: null });
});

describe('useSkillDetailModalStore', () => {
  it('starts closed', () => {
    expect(useSkillDetailModalStore.getState().request).toBeNull();
  });

  it('open() records the skill type id to show', () => {
    useSkillDetailModalStore.getState().open(3300);
    expect(useSkillDetailModalStore.getState().request).toEqual({ typeID: 3300 });
  });

  it('a later open() replaces the previous request', () => {
    useSkillDetailModalStore.getState().open(3300);
    useSkillDetailModalStore.getState().open(3301);
    expect(useSkillDetailModalStore.getState().request).toEqual({ typeID: 3301 });
  });

  it('close() clears the request', () => {
    useSkillDetailModalStore.getState().open(3300);
    useSkillDetailModalStore.getState().close();
    expect(useSkillDetailModalStore.getState().request).toBeNull();
  });

  it('openSkillDetailModal() is the non-React equivalent of open()', () => {
    openSkillDetailModal(3302);
    expect(useSkillDetailModalStore.getState().request).toEqual({ typeID: 3302 });
  });
});
