import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PiData } from '@/sde/types';
import { effectiveLocalResources } from './richnessOverride';

const pi = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/pi.json'), 'utf8')
) as PiData;

const ids = (list: { typeID: number }[]) => list.map((r) => r.typeID);
const all = ids(pi.raw.filter((r) => r.planetTypes.includes('temperate')));

describe('effectiveLocalResources', () => {
  it('is every resource the type yields with no override', () => {
    expect(ids(effectiveLocalResources('temperate', pi, undefined))).toEqual(all);
  });

  it('is every resource for an empty override', () => {
    expect(ids(effectiveLocalResources('temperate', pi, []))).toEqual(all);
  });

  it('narrows to the picked resources, in payload order', () => {
    const [a, b] = [all[2], all[0]];
    expect(ids(effectiveLocalResources('temperate', pi, [a, b]))).toEqual(
      all.filter((id) => id === a || id === b)
    );
  });

  it('ignores a picked resource the planet type cannot yield', () => {
    const offType = pi.raw.find((r) => !r.planetTypes.includes('temperate'))!.typeID;
    expect(ids(effectiveLocalResources('temperate', pi, [all[0], offType]))).toEqual([all[0]]);
  });

  it('falls back to every resource when nothing picked is yielded here', () => {
    const offType = pi.raw.find((r) => !r.planetTypes.includes('temperate'))!.typeID;
    expect(ids(effectiveLocalResources('temperate', pi, [offType, 999_999]))).toEqual(all);
  });
});
