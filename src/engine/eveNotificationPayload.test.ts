import { describe, it, expect } from 'vitest';
import { parseEveNotificationPayload } from './eveNotificationPayload';

/**
 * Robustness first (issue #300 AC2): the parser is fed a `text` blob CCP can
 * reshape without notice, so "returns nothing useful" is a first-class result
 * and throwing is never one. Only after that do the per-type happy paths
 * matter — every one of those fixtures is a real payload sample.
 */
describe('parseEveNotificationPayload — degrades instead of throwing', () => {
  const HOSTILE: ReadonlyArray<[string, string]> = [
    ['empty string', ''],
    ['whitespace only', '   \n\n  '],
    ['an empty YAML mapping', '{}'],
    ['truncated mid-key', 'structureI'],
    ['truncated mid-value', 'structureID: '],
    ['a key with no colon', 'structureID 1000000000001'],
    ['a leading colon', ': 1000000000001'],
    ['prose rather than a mapping', 'The structure was attacked. Good luck!'],
    ['an unresolved YAML alias', 'structureID: *id001'],
    ['a nested block with no scalars', 'oreVolumeByType:\n  46300: 12.5\n'],
    ['a list with no scalars', 'listOfTypesAndQty:\n- - 154\n  - 4312\n'],
    ['CRLF line endings and no known keys', 'someKey: 1\r\notherKey: 2\r\n'],
    ['a non-numeric value in a numeric field', 'structureID: not-a-number\namount: ???\n'],
    ['a numeric field left blank', 'amount:\ndueDate:\n'],
    ['an infinite numeric value', 'amount: .inf\ndueDate: -.inf\n'],
  ];

  it.each(HOSTILE)('returns a payload with no numeric fields for %s', (_label, text) => {
    expect(() => parseEveNotificationPayload(text)).not.toThrow();
    const payload = parseEveNotificationPayload(text);
    expect(payload.structureId).toBeUndefined();
    expect(payload.amount).toBeUndefined();
    expect(payload.dueDateMs).toBeUndefined();
  });

  it('never throws on a huge blob of unrelated lines', () => {
    const text = Array.from({ length: 5_000 }, (_, i) => `key${i}: value${i}`).join('\n');
    expect(() => parseEveNotificationPayload(text)).not.toThrow();
  });

  it('never throws when ESI omits `text` entirely, which the type system cannot prevent', () => {
    // `EveNotificationFire.text` is typed `string`, but it comes from a
    // response body TypeScript never sees — a `.split` on `undefined` is the
    // one throw this module promises not to do.
    const notAString = undefined as unknown as string;
    expect(() => parseEveNotificationPayload(notAString)).not.toThrow();
    expect(parseEveNotificationPayload(notAString)).toEqual(parseEveNotificationPayload(''));
  });
});

describe('parseEveNotificationPayload — YAML subset the payloads actually use', () => {
  it('strips the anchor CCP attaches to every structure id', () => {
    // `structureID: &id001 1000000000001` is how every structure payload
    // carries the id, so a parser that keeps the `&id001` finds nothing at
    // all for eight of the types this ticket renders.
    expect(parseEveNotificationPayload('structureID: &id001 1000000000001').structureId).toBe(
      1_000_000_000_001
    );
  });

  it('strips an anchor whose name is not the usual `id001`', () => {
    expect(
      parseEveNotificationPayload('structureID: &notification_id001 1000000000001').structureId
    ).toBe(1_000_000_000_001);
  });

  it('splits on the first colon only, so link markup survives intact', () => {
    const payload = parseEveNotificationPayload(
      'structureLink: <a href="showinfo:35835//1000000000001">Amamake - Alpha</a>'
    );
    expect(payload.structureName).toBe('Amamake - Alpha');
  });

  it('drops the quotes an emitter adds around a name that needs them', () => {
    // A structure name containing a colon has to come back quoted; the quotes
    // are YAML syntax, not part of what the pilot named the thing.
    expect(parseEveNotificationPayload("structureName: 'Chunk Line 3'").structureName).toBe(
      'Chunk Line 3'
    );
    expect(parseEveNotificationPayload('structureName: "Home: Alpha"').structureName).toBe(
      'Home: Alpha'
    );
  });

  it('leaves an unbalanced quote alone rather than eating a real apostrophe', () => {
    expect(parseEveNotificationPayload("structureName: Pilot's Rest").structureName).toBe(
      "Pilot's Rest"
    );
  });

  it('ignores indented keys so a nested map cannot shadow a top-level one', () => {
    const payload = parseEveNotificationPayload(
      'oreVolumeByType:\n  46300: 1928443.08\nstructureID: 1000000000002\n'
    );
    expect(payload.structureId).toBe(1_000_000_000_002);
  });

  it('reads floats and exponent notation without mangling them', () => {
    expect(parseEveNotificationPayload('amount: 10000.0').amount).toBe(10_000);
    expect(parseEveNotificationPayload('amount: -1').amount).toBe(-1);
    expect(parseEveNotificationPayload('amount: 4.7045e-14').amount).toBeCloseTo(4.7045e-14);
  });

  it('accepts either spelling of the solar-system key CCP is inconsistent about', () => {
    // Not rendered anywhere, but the inconsistency is real (`solarsystemID` on
    // the structure types, `solarSystemID` on the moonmining ones) and is the
    // reason keys are matched case-insensitively.
    expect(parseEveNotificationPayload('structureid: 42').structureId).toBe(42);
    expect(parseEveNotificationPayload('STRUCTUREID: 42').structureId).toBe(42);
  });
});

describe('parseEveNotificationPayload — EVE time encodings', () => {
  it("converts a `dueDate` from EVE's 100ns-since-1601 ticks to epoch ms", () => {
    // BillOutOfMoneyMsg sample: dueDate 132936019800000000 is 2022-04-05T03:13Z.
    const payload = parseEveNotificationPayload('billTypeID: 7\ndueDate: 132936019800000000\n');
    expect(payload.dueDateMs).toBe(Date.parse('2022-04-05T03:13:00Z'));
  });

  it('converts `timeLeft` as a duration, not an instant', () => {
    // StructureLostShields sample: 1727805401093 ticks is ~2 days of
    // reinforcement, and the sibling `vulnerableTime: 9000000000` is exactly
    // the documented 15-minute vulnerability window — which is what pins the
    // 100ns tick scale.
    const payload = parseEveNotificationPayload('timeLeft: 1727805401093\n');
    expect(payload.timeLeftMs).toBe(172_780_540);
  });

  it('rejects a tick count that would land before the EVE epoch', () => {
    expect(parseEveNotificationPayload('dueDate: 0').dueDateMs).toBeUndefined();
    expect(parseEveNotificationPayload('dueDate: -5').dueDateMs).toBeUndefined();
    expect(parseEveNotificationPayload('timeLeft: -5').timeLeftMs).toBeUndefined();
  });
});

describe('parseEveNotificationPayload — real payload samples', () => {
  it('reads StructureUnderAttack: the structure plus the aggressor CCP spells out', () => {
    const payload = parseEveNotificationPayload(
      [
        'allianceID: 3011',
        'allianceLinkData:',
        '- showinfo',
        '- 16159',
        '- 3011',
        'allianceName: Big Bad Alliance',
        'armorPercentage: 98.65129050962584',
        'charID: 1011',
        'corpLinkData:',
        '- showinfo',
        '- 2',
        '- 2011',
        'corpName: Bad Company',
        'hullPercentage: 100.0',
        'shieldPercentage: 4.704536686417284e-14',
        'solarsystemID: 30002537',
        'structureID: &id001 1000000000001',
        'structureShowInfoData:',
        '- showinfo',
        '- 35835',
        '- *id001',
        'structureTypeID: 35835',
        '',
      ].join('\n')
    );
    expect(payload.structureId).toBe(1_000_000_000_001);
    expect(payload.corpName).toBe('Bad Company');
    expect(payload.allianceName).toBe('Big Bad Alliance');
    expect(payload.charId).toBe(1011);
  });

  it('reads StructureLostShields: the structure and the reinforcement duration', () => {
    const payload = parseEveNotificationPayload(
      [
        'solarsystemID: 30002537',
        'structureID: &id001 1000000000001',
        'structureShowInfoData:',
        '- showinfo',
        '- 35835',
        '- *id001',
        'structureTypeID: 35835',
        'timeLeft: 1727805401093',
        'timestamp: 132148470780000000',
        'vulnerableTime: 9000000000',
        '',
      ].join('\n')
    );
    expect(payload.structureId).toBe(1_000_000_000_001);
    expect(payload.timeLeftMs).toBe(172_780_540);
  });

  it('reads StructureImpendingAbandonmentAssetsAtRisk: name from the link, days from the count', () => {
    const payload = parseEveNotificationPayload(
      [
        'daysUntilAbandon: 2',
        'isCorpOwned: true',
        'solarsystemID: 30002537',
        'structureID: &id001 1000000000001',
        'structureLink: <a href="showinfo:35835//1000000000001">Amamake - Alpha</a>',
        'structureShowInfoData:',
        '- showinfo',
        '- 35835',
        '- *id001',
        'structureTypeID: 35835',
        '',
      ].join('\n')
    );
    expect(payload.structureName).toBe('Amamake - Alpha');
    expect(payload.daysUntilAbandon).toBe(2);
  });

  it('reads MoonminingExtractionFinished: the structure name straight out of the payload', () => {
    const payload = parseEveNotificationPayload(
      [
        'autoTime: 132187608610000000',
        'moonID: 40161465',
        'oreVolumeByType:',
        '  46300: 6022254.470615254',
        '  46301: 1920395.2662618621',
        'solarSystemID: 30002537',
        'structureID: 1000000000002',
        'structureLink: <a href="showinfo:35835//1000000000002">Dummy</a>',
        'structureName: Chunk Line 3',
        'structureTypeID: 35835',
        '',
      ].join('\n')
    );
    // `structureName` wins over the link text: it is the unmarked-up value.
    expect(payload.structureName).toBe('Chunk Line 3');
    expect(payload.structureId).toBe(1_000_000_000_002);
  });

  it('reads CorpAllBillMsg: amount and due date', () => {
    const payload = parseEveNotificationPayload(
      [
        'amount: 6000000',
        'billTypeID: 5',
        'creditorID: 2011',
        'currentDate: 133462502887835953',
        'debtorID: 2001',
        'dueDate: 133488422887817240',
        'externalID: 3001',
        'externalID2: -1',
        '',
      ].join('\n')
    );
    expect(payload.amount).toBe(6_000_000);
    expect(payload.dueDateMs).toBe(Date.parse('2024-01-04T11:44:48.782Z'));
  });

  it('reads WarDeclared: the aggressor and the war headquarters', () => {
    const payload = parseEveNotificationPayload(
      [
        'againstID: 3001',
        'cost: 100000000',
        'declaredByID: 3011',
        'delayHours: 24',
        'hostileState: false',
        'timeStarted: 132192693000000000',
        'warHQ: <b>Amamake - Test Structure Alpha</b>',
        'warHQ_IdType:',
        '- 1000000000001',
        '- 35835',
        '',
      ].join('\n')
    );
    expect(payload.declaredById).toBe(3011);
    expect(payload.againstId).toBe(3001);
    expect(payload.warHqName).toBe('Amamake - Test Structure Alpha');
  });

  it('reads CorpAppNewMsg: the applicant', () => {
    const payload = parseEveNotificationPayload(
      'applicationText: example\ncharID: 1011\ncorpID: 2001\n'
    );
    expect(payload.charId).toBe(1011);
    expect(payload.corpId).toBe(2001);
  });
});
