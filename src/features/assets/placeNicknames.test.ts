import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  PLACE_NICKNAME_MAX,
  parsePlaceNicknames,
  savePlaceNickname,
  withPlaceNickname,
} from './placeNicknames';
import { MOVE_PLAN_URL_SCHEMA, NO_MOVE_PLAN, movePlanKey } from './movePlanUrl';
import { locationLabel } from './assetsLogic';

const STRUCTURE_ID = 1_040_000_000_001;

describe('place nicknames', () => {
  it('stores a trimmed name and drops the entry on a blank one', () => {
    const named = withPlaceNickname({}, STRUCTURE_ID, '  Home market  ');
    expect(named).toEqual({ [STRUCTURE_ID]: 'Home market' });
    expect(withPlaceNickname(named, STRUCTURE_ID, '   ')).toEqual({});
  });

  it('caps a long name', () => {
    const named = withPlaceNickname({}, 60003760, 'x'.repeat(PLACE_NICKNAME_MAX + 20));
    expect(named[60003760]).toHaveLength(PLACE_NICKNAME_MAX);
  });

  it('keeps usable entries (large structure ids too) and drops damaged ones', () => {
    expect(
      parsePlaceNicknames({ 60003760: 'Home', [STRUCTURE_ID]: 'Staging', 1: '', 2: 4, x: 'Bad' })
    ).toEqual({ 60003760: 'Home', [STRUCTURE_ID]: 'Staging' });
    expect(parsePlaceNicknames('Home')).toEqual({});
  });
});

describe('a nickname stays on the Assets display', () => {
  it('the Move plan URL carries ids only, so a link cannot hold a nickname', () => {
    expect(Object.keys(MOVE_PLAN_URL_SCHEMA).sort()).toEqual(
      ['mv', 'mvc', 'mvd', 'mvh', 'mvp', 'mvr'].sort()
    );
    const key = movePlanKey({
      ...NO_MOVE_PLAN,
      mv: ['1:60003760:34:loose'],
      mvd: { kind: 'station', id: 60003760 },
    });
    expect(key).not.toMatch(/Home|nickname/i);
  });

  it('place resolution returns the real name whatever nickname is set', async () => {
    await savePlaceNickname(60003760, 'Home market');
    const label = locationLabel(
      60003760,
      'station',
      new Map([[60003760, 'Jita IV - Moon 4']]),
      new Map(),
      new Map(),
      ((k: string) => k) as never
    );
    expect(label).toBe('Jita IV - Moon 4');
  });

  it('no resolver, loader, share or plan module reads the nickname store', () => {
    const readers = [
      'src/features/places/resolve.ts',
      'src/features/places/useKnownPlaces.ts',
      'src/features/places/usePlaceDetails.ts',
      'src/features/assets/assetsLogic.ts',
      'src/features/assets/assetsSnapshot.ts',
      'src/features/assets/movePlanUrl.ts',
      'src/features/assets/activeHaul.ts',
    ];
    for (const file of readers) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/placeNicknames/);
    }
  });
});
