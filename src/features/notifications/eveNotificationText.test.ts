import { describe, it, expect } from 'vitest';
import {
  eveNotificationText,
  EVE_NOTIFICATION_RENDERED_TYPES,
  type EveNotificationNames,
} from './eveNotificationText';
import { EVE_ALLOWED_TYPES } from './eventSelection';
import type { EveNotificationFire } from '@/engine/notificationDiffs';

function fire(overrides: Partial<EveNotificationFire> = {}): EveNotificationFire {
  return {
    eventId: 'eveNotification',
    characterId: 1,
    notificationId: 1,
    type: 'BillOutOfMoneyMsg',
    senderId: 1000132,
    senderType: 'corporation',
    text: 'amount: 12345\n',
    timestamp: '2026-09-03T00:00:00Z',
    ...overrides,
  };
}

const CHARACTER = { name: 'Test Pilot' };

/**
 * The generic body is the one that spells the raw `type` out — so "this body
 * does not name its own type" is what distinguishes a real body from the
 * fallback, and is the shape AC1 asks for.
 */
function expectNotTheGenericBody(body: string, type: string): void {
  expect(body).not.toContain(type);
}

describe('eveNotificationText', () => {
  it('renders a title and body for a known type', () => {
    const { title, body } = eveNotificationText(fire(), CHARACTER);
    expect(title).toBeTruthy();
    expect(body).toBeTruthy();
  });

  it("names the character, like every other event's notification body", () => {
    const { body } = eveNotificationText(fire(), CHARACTER);
    expect(body).toContain('Test Pilot');
  });

  it('renders generically for a type this catalog has never heard of, without throwing (AC2)', () => {
    // In production `foregroundPoller.ts` drops anything off the allow-list
    // before it reaches here, so this type can't actually occur — but the
    // function stays defensive rather than assuming its caller.
    expect(() =>
      eveNotificationText(fire({ type: 'SomeBrandNewMsgType6041' }), CHARACTER)
    ).not.toThrow();
    const { body } = eveNotificationText(fire({ type: 'SomeBrandNewMsgType6041' }), CHARACTER);
    expect(body).toContain('SomeBrandNewMsgType6041');
  });

  it('has exactly one renderer per allow-listed type — no extra, no missing', () => {
    expect([...EVE_NOTIFICATION_RENDERED_TYPES].sort()).toEqual([...EVE_ALLOWED_TYPES].sort());
  });
});

/**
 * Issue #300 AC2, checked across the whole rendered set rather than per type:
 * whatever CCP reshapes a payload into, the notification still arrives, still
 * names the character, and never carries a raw i18n key or an `undefined`.
 */
describe('eveNotificationText — a payload it cannot read never costs the notification', () => {
  const HOSTILE_PAYLOADS: ReadonlyArray<[string, string]> = [
    ['an empty payload', ''],
    ['an empty YAML mapping', '{}'],
    ['a truncated payload', 'structureID: &id00'],
    ['prose instead of a mapping', 'Something happened somewhere.'],
    ['keys with no values', 'structureID:\ndueDate:\ncharID:\n'],
    ['wrong-typed values', 'structureID: null\ndueDate: soon\namount: lots\ncharID: nobody\n'],
    ['only unrelated keys', 'someFutureField: 42\nanotherOne: hello\n'],
  ];

  for (const type of EVE_NOTIFICATION_RENDERED_TYPES) {
    it.each(HOSTILE_PAYLOADS)(`${type} survives %s`, (_label, text) => {
      expect(() => eveNotificationText(fire({ type, text }), CHARACTER)).not.toThrow();
      const { title, body } = eveNotificationText(fire({ type, text }), CHARACTER);
      expect(title).toBeTruthy();
      expect(body).toBeTruthy();
      expect(body).toContain('Test Pilot');
      expect(body).not.toContain('notifications.fired');
      expect(body).not.toContain('undefined');
      expect(body).not.toContain('NaN');
    });
  }

  it('falls back to the generic body when a required field is missing', () => {
    // BillOutOfMoneyMsg needs a due date; `amount` alone is a truncated payload.
    const { body } = eveNotificationText(
      fire({ type: 'BillOutOfMoneyMsg', text: 'amount: 1\n' }),
      CHARACTER
    );
    expect(body).toContain('BillOutOfMoneyMsg');
  });

  it('falls back rather than throwing when the fire timestamp is unusable', () => {
    const { body } = eveNotificationText(
      fire({
        type: 'StructureLostShields',
        text: 'structureID: &id001 1000000000001\ntimeLeft: 1727805401093\n',
        timestamp: 'not-a-timestamp',
      }),
      CHARACTER
    );
    // Still specific about the structure — only the timer is dropped.
    expect(body).toContain('structure #1000000000001');
    expect(body).not.toContain('Invalid Date');
  });
});

describe('eveNotificationText — structures', () => {
  const STRUCTURE_PAYLOAD = [
    'solarsystemID: 30002537',
    'structureID: &id001 1000000000001',
    'structureShowInfoData:',
    '- showinfo',
    '- 35835',
    '- *id001',
    'structureTypeID: 35835',
    '',
  ].join('\n');

  const NAMES: EveNotificationNames = { structure: "Athanor 'Chunk Line 3'" };

  it('StructureFuelAlert names the structure and the fuel', () => {
    const { title, body } = eveNotificationText(
      fire({ type: 'StructureFuelAlert', text: STRUCTURE_PAYLOAD }),
      CHARACTER,
      NAMES
    );
    expect(title).toBe('Structure low on fuel');
    expect(body).toContain("Athanor 'Chunk Line 3'");
    expect(body).toContain('fuel');
    expectNotTheGenericBody(body, 'StructureFuelAlert');
  });

  it('falls back to the structure id when the name has not resolved, rather than delaying', () => {
    const { body } = eveNotificationText(
      fire({ type: 'StructureFuelAlert', text: STRUCTURE_PAYLOAD }),
      CHARACTER
    );
    expect(body).toContain('structure #1000000000001');
  });

  it('StructureWentLowPower and StructureWentHighPower name the structure and differ from each other', () => {
    const low = eveNotificationText(
      fire({ type: 'StructureWentLowPower', text: STRUCTURE_PAYLOAD }),
      CHARACTER,
      NAMES
    );
    const high = eveNotificationText(
      fire({ type: 'StructureWentHighPower', text: STRUCTURE_PAYLOAD }),
      CHARACTER,
      NAMES
    );
    expect(low.body).toContain("Athanor 'Chunk Line 3'");
    expect(high.body).toContain("Athanor 'Chunk Line 3'");
    expect(low.body).not.toBe(high.body);
  });

  it('StructureServicesOffline names the structure', () => {
    const { body } = eveNotificationText(
      fire({
        type: 'StructureServicesOffline',
        text: `listOfServiceModuleIDs:\n- 35894\n${STRUCTURE_PAYLOAD}`,
      }),
      CHARACTER,
      NAMES
    );
    expect(body).toContain("Athanor 'Chunk Line 3'");
    expect(body).toContain('service');
  });

  it('StructureUnderAttack names the aggressor CCP spelled out in the payload', () => {
    const { title, body } = eveNotificationText(
      fire({
        type: 'StructureUnderAttack',
        text: [
          'allianceID: 3011',
          'allianceName: Big Bad Alliance',
          'armorPercentage: 98.65129050962584',
          'charID: 1011',
          'corpName: Bad Company',
          'hullPercentage: 100.0',
          'shieldPercentage: 4.704536686417284e-14',
          STRUCTURE_PAYLOAD,
        ].join('\n'),
      }),
      CHARACTER,
      NAMES
    );
    expect(title).toBe('Structure under attack');
    expect(body).toContain("Athanor 'Chunk Line 3'");
    expect(body).toContain('Bad Company');
  });

  it('StructureUnderAttack still names the structure when the payload carries no aggressor', () => {
    const { body } = eveNotificationText(
      fire({ type: 'StructureUnderAttack', text: STRUCTURE_PAYLOAD }),
      CHARACTER,
      NAMES
    );
    expect(body).toContain("Athanor 'Chunk Line 3'");
    expect(body).toContain('under attack');
  });

  it('StructureLostShields names the structure and when the reinforcement timer ends', () => {
    const { title, body } = eveNotificationText(
      fire({
        type: 'StructureLostShields',
        // 1727805401093 ticks is ~2 days after the fire instant.
        text: `${STRUCTURE_PAYLOAD}timeLeft: 1727805401093\ntimestamp: 132148470780000000\nvulnerableTime: 9000000000\n`,
        timestamp: '2026-09-03T00:00:00Z',
      }),
      CHARACTER,
      NAMES
    );
    expect(title).toBe('Structure reinforced');
    expect(body).toContain("Athanor 'Chunk Line 3'");
    expect(body).toContain('shields');
    // Timezone-independent: two days on from 2026-09-03 lands in 2026-09-05
    // in every zone the runner might be in.
    expect(body).toMatch(/2026-09-0[456]/);
  });

  it('StructureLostArmor reads as a hull timer, not a shield one', () => {
    const shields = eveNotificationText(
      fire({ type: 'StructureLostShields', text: `${STRUCTURE_PAYLOAD}timeLeft: 1727805401093\n` }),
      CHARACTER,
      NAMES
    );
    const armor = eveNotificationText(
      fire({ type: 'StructureLostArmor', text: `${STRUCTURE_PAYLOAD}timeLeft: 7333797161804\n` }),
      CHARACTER,
      NAMES
    );
    expect(armor.body).toContain('armor');
    expect(armor.body).not.toBe(shields.body);
  });

  it('StructureLostShields drops only the timer when the payload has no timeLeft', () => {
    const { body } = eveNotificationText(
      fire({ type: 'StructureLostShields', text: STRUCTURE_PAYLOAD }),
      CHARACTER,
      NAMES
    );
    expect(body).toContain("Athanor 'Chunk Line 3'");
    expectNotTheGenericBody(body, 'StructureLostShields');
  });

  it('StructureImpendingAbandonmentAssetsAtRisk names the structure from its link and counts the days', () => {
    const { title, body } = eveNotificationText(
      fire({
        type: 'StructureImpendingAbandonmentAssetsAtRisk',
        text: [
          'daysUntilAbandon: 2',
          'isCorpOwned: true',
          'solarsystemID: 30002537',
          'structureID: &id001 1000000000001',
          'structureLink: <a href="showinfo:35835//1000000000001">Amamake - Alpha</a>',
          'structureTypeID: 35835',
          '',
        ].join('\n'),
      }),
      CHARACTER
    );
    expect(title).toBe('Assets at risk');
    expect(body).toContain('Amamake - Alpha');
    expect(body).toContain('2 days');
  });

  it('pluralises a single remaining day', () => {
    const { body } = eveNotificationText(
      fire({
        type: 'StructureImpendingAbandonmentAssetsAtRisk',
        text: 'daysUntilAbandon: 1\nstructureID: &id001 1000000000001\n',
      }),
      CHARACTER
    );
    expect(body).toContain('1 day.');
  });
});

describe('eveNotificationText — moon mining', () => {
  const MOON_PAYLOAD = [
    'autoTime: 132187608610000000',
    'moonID: 40161465',
    'oreVolumeByType:',
    '  46300: 6022254.470615254',
    '  46301: 1920395.2662618621',
    'solarSystemID: 30002537',
    'structureID: 1000000000002',
    'structureLink: <a href="showinfo:35835//1000000000002">Chunk Line 3</a>',
    'structureName: Chunk Line 3',
    'structureTypeID: 35835',
    '',
  ].join('\n');

  it('MoonminingExtractionFinished names the refinery from the payload, with no lookup needed', () => {
    const { title, body } = eveNotificationText(
      fire({ type: 'MoonminingExtractionFinished', text: MOON_PAYLOAD }),
      CHARACTER
    );
    expect(title).toBe('Moon extraction ready');
    expect(body).toContain('Chunk Line 3');
    expect(body).toContain('extraction');
  });

  it('MoonminingAutomaticFracture reads as the automatic case', () => {
    const { body } = eveNotificationText(
      fire({ type: 'MoonminingAutomaticFracture', text: MOON_PAYLOAD }),
      CHARACTER
    );
    expect(body).toContain('Chunk Line 3');
    expect(body).toContain('fractured');
  });
});

describe('eveNotificationText — bills', () => {
  it('CorpAllBillMsg names the amount and the due date', () => {
    const { title, body } = eveNotificationText(
      fire({
        type: 'CorpAllBillMsg',
        text: [
          'amount: 6000000',
          'billTypeID: 5',
          'creditorID: 2011',
          'currentDate: 133462502887835953',
          'debtorID: 2001',
          'dueDate: 133488422887817240',
          'externalID: 3001',
          'externalID2: -1',
          '',
        ].join('\n'),
      }),
      CHARACTER
    );
    expect(title).toBe('Corporation bill issued');
    expect(body).toContain('6,000,000');
    expect(body).toContain('2024-01-0');
  });

  it('CorpAllBillMsg still renders when only the amount survived', () => {
    const { body } = eveNotificationText(
      fire({ type: 'CorpAllBillMsg', text: 'amount: 146225\n' }),
      CHARACTER
    );
    expect(body).toContain('146,225');
    expectNotTheGenericBody(body, 'CorpAllBillMsg');
  });

  it('BillOutOfMoneyMsg names the due date the corp wallet is short for', () => {
    const { title, body } = eveNotificationText(
      fire({ type: 'BillOutOfMoneyMsg', text: 'billTypeID: 7\ndueDate: 132936019800000000\n' }),
      CHARACTER
    );
    expect(title).toBe('Bill could not be paid');
    expect(body).toContain('2022-04-0');
  });

  it('CorpOfficeExpirationMsg says what happened even when CCP sends no fields at all', () => {
    // No public schema and no public sample exists for this type, so the plain
    // sentence is the floor rather than a degraded state.
    const { title, body } = eveNotificationText(
      fire({ type: 'CorpOfficeExpirationMsg', text: '' }),
      CHARACTER
    );
    expect(title).toBe('Corporation office expiring');
    expect(body).toContain('office');
    expectNotTheGenericBody(body, 'CorpOfficeExpirationMsg');
  });

  it('CorpOfficeExpirationMsg names the expiry when the payload carries a due date', () => {
    const { body } = eveNotificationText(
      fire({ type: 'CorpOfficeExpirationMsg', text: 'dueDate: 132936019800000000\n' }),
      CHARACTER
    );
    expect(body).toContain('2022-04-0');
  });
});

describe('eveNotificationText — wars and applications', () => {
  const WAR_PAYLOAD = [
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
  ].join('\n');

  const WAR_NAMES: EveNotificationNames = { entities: new Map([[3011, 'Big Bad Alliance']]) };

  it('WarDeclared names the aggressor and the war headquarters', () => {
    const { title, body } = eveNotificationText(
      fire({ type: 'WarDeclared', text: WAR_PAYLOAD }),
      CHARACTER,
      WAR_NAMES
    );
    expect(title).toBe('War declared');
    expect(body).toContain('Big Bad Alliance');
    expect(body).toContain('Amamake - Test Structure Alpha');
  });

  it('WarDeclared falls back to the aggressor id rather than waiting on a name', () => {
    const { body } = eveNotificationText(
      fire({ type: 'WarDeclared', text: WAR_PAYLOAD }),
      CHARACTER
    );
    expect(body).toContain('#3011');
    expectNotTheGenericBody(body, 'WarDeclared');
  });

  it('AllWarDeclaredMsg names the aggressor and says it is the alliance under war', () => {
    const { title, body } = eveNotificationText(
      fire({
        type: 'AllWarDeclaredMsg',
        text: 'againstID: 3001\ncost: 5000000000\ndeclaredByID: 3011\ndelayHours: 24\nhostileState: 0\n',
      }),
      CHARACTER,
      WAR_NAMES
    );
    expect(title).toBe('War declared on your alliance');
    expect(body).toContain('Big Bad Alliance');
    expect(body).toContain('alliance');
  });

  it('CorpBecameWarEligible says what changed even though its payload is empty', () => {
    const { title, body } = eveNotificationText(
      fire({ type: 'CorpBecameWarEligible', text: '{}' }),
      CHARACTER
    );
    expect(title).toBe('Corporation is war eligible');
    expect(body).toContain('war');
    expectNotTheGenericBody(body, 'CorpBecameWarEligible');
  });

  it('CorpAppNewMsg names the applicant', () => {
    const { title, body } = eveNotificationText(
      fire({
        type: 'CorpAppNewMsg',
        text: 'applicationText: example\ncharID: 1011\ncorpID: 2001\n',
      }),
      CHARACTER,
      { entities: new Map([[1011, 'Hopeful Recruit']]) }
    );
    expect(title).toBe('New corporation application');
    expect(body).toContain('Hopeful Recruit');
  });

  it('CorpAppNewMsg falls back to the applicant id when the name has not resolved', () => {
    const { body } = eveNotificationText(
      fire({
        type: 'CorpAppNewMsg',
        text: 'applicationText: example\ncharID: 1011\ncorpID: 2001\n',
      }),
      CHARACTER
    );
    expect(body).toContain('#1011');
  });
});

describe('eveNotificationText — the rendered set stays deliberately small', () => {
  it('covers exactly the types issue #300 named', () => {
    expect([...EVE_NOTIFICATION_RENDERED_TYPES].sort()).toEqual(
      [
        'AllWarDeclaredMsg',
        'BillOutOfMoneyMsg',
        'CorpAllBillMsg',
        'CorpAppNewMsg',
        'CorpBecameWarEligible',
        'CorpOfficeExpirationMsg',
        'MoonminingAutomaticFracture',
        'MoonminingExtractionFinished',
        'StructureFuelAlert',
        'StructureImpendingAbandonmentAssetsAtRisk',
        'StructureLostArmor',
        'StructureLostShields',
        'StructureServicesOffline',
        'StructureUnderAttack',
        'StructureWentHighPower',
        'StructureWentLowPower',
        'WarDeclared',
      ].sort()
    );
  });
});
