import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MOON_ORE_VARIANTS,
  chunkMinedPct,
  moonOreBaseOf,
  splitChunkVariants,
} from './moonOreVariants';

const ZEOLITES = 45490;
const BRIMFUL_ZEOLITES = 46280;
const GLISTENING_ZEOLITES = 46281;
const BITUMENS = 45492;
const BRIMFUL_BITUMENS = 46284;

describe('MOON_ORE_VARIANTS', () => {
  const types = JSON.parse(
    readFileSync(join(process.cwd(), 'public', 'data', 'types.json'), 'utf-8')
  ) as Record<string, { name: string }>;
  const moonOres = JSON.parse(
    readFileSync(join(process.cwd(), 'public', 'data', 'moonOreTypes.json'), 'utf-8')
  ) as number[];

  it('names each base ore and its two richer variants as the SDE does', () => {
    for (const [base, variants] of MOON_ORE_VARIANTS) {
      const baseName = types[String(base)].name;
      for (const v of variants) expect(types[String(v)].name).toMatch(new RegExp(` ${baseName}$`));
    }
  });

  it('covers every raw moon ore the SDE lists', () => {
    const raw = moonOres.filter((id) => !types[String(id)].name.startsWith('Compressed '));
    const listed = [...MOON_ORE_VARIANTS].flatMap(([base, variants]) => [base, ...variants]);
    expect([...listed].sort()).toEqual([...raw].sort());
  });
});

describe('moonOreBaseOf', () => {
  it('maps a variant to its base ore and leaves any other type as it is', () => {
    expect(moonOreBaseOf(BRIMFUL_BITUMENS)).toBe(BITUMENS);
    expect(moonOreBaseOf(GLISTENING_ZEOLITES)).toBe(ZEOLITES);
    expect(moonOreBaseOf(BITUMENS)).toBe(BITUMENS);
    expect(moonOreBaseOf(1230)).toBe(1230);
  });
});

describe('splitChunkVariants', () => {
  const chunk = [
    { typeId: ZEOLITES, quantity: 1000 },
    { typeId: BITUMENS, quantity: 2000 },
  ];

  it('splits a base ore by the share of each variant mined', () => {
    const mined = [
      { typeId: ZEOLITES, quantity: 300 },
      { typeId: BRIMFUL_ZEOLITES, quantity: 100 },
      { typeId: BITUMENS, quantity: 500 },
    ];
    expect(splitChunkVariants(chunk, mined)).toEqual([
      { typeId: ZEOLITES, quantity: 750 },
      { typeId: BRIMFUL_ZEOLITES, quantity: 250 },
      { typeId: BITUMENS, quantity: 2000 },
    ]);
  });

  it('keeps the base ore’s total exactly, the rounding going to the largest share', () => {
    const mined = [
      { typeId: ZEOLITES, quantity: 1 },
      { typeId: BRIMFUL_ZEOLITES, quantity: 1 },
      { typeId: GLISTENING_ZEOLITES, quantity: 1 },
    ];
    const split = splitChunkVariants([{ typeId: ZEOLITES, quantity: 1000 }], mined);
    expect(split.reduce((s, l) => s + l.quantity, 0)).toBe(1000);
    expect(split).toEqual([
      { typeId: ZEOLITES, quantity: 334 },
      { typeId: BRIMFUL_ZEOLITES, quantity: 333 },
      { typeId: GLISTENING_ZEOLITES, quantity: 333 },
    ]);
  });

  it('uses the survey’s split only while nothing of that ore has been mined', () => {
    const survey = [
      { typeId: ZEOLITES, quantity: 50 },
      { typeId: BRIMFUL_ZEOLITES, quantity: 50 },
      { typeId: BITUMENS, quantity: 10 },
      { typeId: BRIMFUL_BITUMENS, quantity: 30 },
    ];
    const mined = [{ typeId: ZEOLITES, quantity: 10 }];
    expect(splitChunkVariants(chunk, mined, survey)).toEqual([
      { typeId: ZEOLITES, quantity: 1000 },
      { typeId: BITUMENS, quantity: 500 },
      { typeId: BRIMFUL_BITUMENS, quantity: 1500 },
    ]);
  });

  it('leaves a base ore whole with neither mined ore nor a survey to split it by', () => {
    expect(splitChunkVariants(chunk, [])).toEqual(chunk);
  });

  it('keeps a make-up that already names its variants while nothing of that ore is mined', () => {
    const named = [
      { typeId: BITUMENS, quantity: 600 },
      { typeId: BRIMFUL_BITUMENS, quantity: 400 },
    ];
    const survey = [{ typeId: BRIMFUL_BITUMENS, quantity: 1 }];
    expect(splitChunkVariants(named, [], survey)).toEqual(named);
  });

  it('re-splits a make-up already split (by a survey) by what was then mined', () => {
    const named = [
      { typeId: BITUMENS, quantity: 750 },
      { typeId: BRIMFUL_BITUMENS, quantity: 250 },
    ];
    const mined = [
      { typeId: BITUMENS, quantity: 300 },
      { typeId: BRIMFUL_BITUMENS, quantity: 500 },
    ];
    expect(splitChunkVariants(named, mined)).toEqual([
      { typeId: BITUMENS, quantity: 375 },
      { typeId: BRIMFUL_BITUMENS, quantity: 625 },
    ]);
    expect(chunkMinedPct(named, mined)).toBe(80);
  });
});

describe('chunkMinedPct', () => {
  it('counts a variant mined against its base ore’s line', () => {
    const chunk = [{ typeId: BITUMENS, quantity: 1000 }];
    const mined = [
      { typeId: BITUMENS, quantity: 400 },
      { typeId: BRIMFUL_BITUMENS, quantity: 400 },
    ];
    expect(chunkMinedPct(chunk, mined)).toBe(80);
  });

  it('caps each ore at its line, and is null for an empty make-up', () => {
    const chunk = [
      { typeId: ZEOLITES, quantity: 600 },
      { typeId: BITUMENS, quantity: 400 },
    ];
    expect(chunkMinedPct(chunk, [{ typeId: ZEOLITES, quantity: 900 }])).toBe(60);
    expect(chunkMinedPct([], [])).toBeNull();
  });
});
