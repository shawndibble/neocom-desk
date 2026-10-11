import { beforeEach, describe, expect, it } from 'vitest';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { setActiveCharacterAndScope } from './switchCharacter';
import { useOverviewScopeAll } from './widgets/scope';

beforeEach(async () => {
  await useActiveCharacter.getState().setActiveCharacter(1);
  await useOverviewScopeAll.getState().setValue(false);
});

describe('setActiveCharacterAndScope', () => {
  it('turns All characters on without moving the active Character', async () => {
    await setActiveCharacterAndScope('all');
    expect(useOverviewScopeAll.getState().value).toBe(true);
    expect(useActiveCharacter.getState().activeCharacterId).toBe(1);
  });

  it('picks a Character and turns All characters off', async () => {
    await setActiveCharacterAndScope('all');
    await setActiveCharacterAndScope('2');
    expect(useActiveCharacter.getState().activeCharacterId).toBe(2);
    expect(useOverviewScopeAll.getState().value).toBe(false);
  });

  it('ignores a choice that is neither', async () => {
    await setActiveCharacterAndScope('nonsense');
    expect(useActiveCharacter.getState().activeCharacterId).toBe(1);
  });
});
