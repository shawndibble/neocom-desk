import { describe, expect, it } from 'vitest';
import type { AffectedSource } from './affectedBy';
import { skilledSourcesOf } from './skilledSources';

const source = (over: Partial<AffectedSource>): AffectedSource => ({
  kind: 'skill',
  typeId: 3394,
  operator: 'PostPercent',
  value: 5,
  penalty: null,
  applied: true,
  ...over,
});

const IMPLANT = 13258;
const ZEALOT = 12003;

describe('skilledSourcesOf', () => {
  it('names each skill, implant and hull bonus once, skills first', () => {
    expect(
      skilledSourcesOf(
        [
          source({ kind: 'item', typeId: IMPLANT }),
          source({ kind: 'ship', typeId: ZEALOT }),
          source({ typeId: 3394 }),
          source({ typeId: 3394 }),
          source({ typeId: 3392 }),
        ],
        { implantTypeIds: [IMPLANT] }
      )
    ).toEqual([
      { kind: 'skill', typeId: 3394 },
      { kind: 'skill', typeId: 3392 },
      { kind: 'implant', typeId: IMPLANT },
      { kind: 'hull', typeId: ZEALOT },
    ]);
  });

  it('leaves out what did not apply, and items that are not the pilot’s implants', () => {
    expect(
      skilledSourcesOf(
        [
          source({ applied: false }),
          source({ kind: 'item', typeId: 3530 }),
          source({ kind: 'character', typeId: null }),
        ],
        { implantTypeIds: [IMPLANT] }
      )
    ).toEqual([]);
  });
});
