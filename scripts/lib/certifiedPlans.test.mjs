import { describe, it, expect } from 'vitest';
import {
  bakeCertifiedPlans,
  factionNames,
  parseJsonl,
  plainDescription,
} from './certifiedPlans.mjs';

const SKILLS = new Set([3327, 3413, 3380, 3387]);
const FACTIONS = new Map([[500001, 'Caldari State']]);

function record(overrides = {}) {
  return {
    _key: 14,
    careerPathID: 5,
    internalName: 'Industrialist - Manufacturer',
    name: { de: 'Hersteller', en: 'Manufacturer' },
    description: { en: 'Builds things.' },
    skillRequirements: [
      { level: 1, typeID: 3327 },
      { level: 1, typeID: 3413 },
      { level: 2, typeID: 3327 },
      { level: 1, typeID: 3380 },
    ],
    milestones: [{ level: 2, typeID: 3327 }],
    ...overrides,
  };
}

describe('parseJsonl', () => {
  it('parses one JSON object per line and skips blank lines', () => {
    expect(parseJsonl('{"a":1}\n\n{"a":2}\r\n')).toEqual([{ a: 1 }, { a: 2 }]);
  });
});

describe('factionNames', () => {
  it('maps each faction to its English name and skips one without', () => {
    const names = factionNames([
      { _key: 500001, name: { en: 'Caldari State', de: 'Staat der Caldari' } },
      { _key: 500002, name: {} },
    ]);
    expect(names.get(500001)).toBe('Caldari State');
    expect(names.has(500002)).toBe(false);
  });
});

describe('plainDescription', () => {
  it('turns line breaks into newlines and drops every tag, links included', () => {
    const html =
      'Start in an <a href="fitting:587:11563;1::">Iteron Mark V</a>.<br><br>Open the <a href="localsvc:x">Agency</a>.';
    expect(plainDescription(html)).toBe('Start in an Iteron Mark V.\n\nOpen the Agency.');
  });

  it('decodes the HTML entities CCP uses', () => {
    expect(plainDescription('Mining &amp; hauling &lt;fast&gt; &quot;now&quot; it&#39;s')).toBe(
      'Mining & hauling <fast> "now" it\'s'
    );
  });

  it('is empty for a missing description', () => {
    expect(plainDescription(undefined)).toBe('');
  });
});

describe('bakeCertifiedPlans', () => {
  it("keeps CCP's entry order and the English name", () => {
    const [plan] = bakeCertifiedPlans([record()], SKILLS, FACTIONS);
    expect(plan).toEqual({
      id: 14,
      name: 'Manufacturer',
      description: 'Builds things.',
      careerPathId: 5,
      entries: [
        { skillTypeID: 3327, level: 1 },
        { skillTypeID: 3413, level: 1 },
        { skillTypeID: 3327, level: 2 },
        { skillTypeID: 3380, level: 1 },
      ],
      milestones: [{ skillTypeID: 3327, level: 2 }],
    });
  });

  it('names the faction when the plan has one', () => {
    const [plan] = bakeCertifiedPlans([record({ factionID: 500001 })], SKILLS, FACTIONS);
    expect(plan.factionId).toBe(500001);
    expect(plan.factionName).toBe('Caldari State');
  });

  it('drops a plan with no career path (the AIR tutorial stub)', () => {
    const stub = record({ _key: 33, careerPathID: undefined, name: { en: 'AIR' } });
    expect(bakeCertifiedPlans([stub], SKILLS, FACTIONS)).toEqual([]);
  });

  it('drops entries and milestones naming a skill the skill catalog lacks', () => {
    const [plan] = bakeCertifiedPlans(
      [
        record({
          skillRequirements: [
            { level: 1, typeID: 3327 },
            { level: 1, typeID: 99999 },
          ],
          milestones: [
            { level: 1, typeID: 3327 },
            { level: 1, typeID: 99999 },
          ],
        }),
      ],
      SKILLS,
      FACTIONS
    );
    expect(plan.entries).toEqual([{ skillTypeID: 3327, level: 1 }]);
    expect(plan.milestones).toEqual([{ skillTypeID: 3327, level: 1 }]);
  });

  it('drops ship milestones, which have no skill level to anchor to', () => {
    const [plan] = bakeCertifiedPlans(
      [record({ milestones: [{ typeID: 657 }, { level: 2, typeID: 3327 }] })],
      SKILLS,
      FACTIONS
    );
    expect(plan.milestones).toEqual([{ skillTypeID: 3327, level: 2 }]);
  });

  it('drops a milestone the plan never trains to', () => {
    const [plan] = bakeCertifiedPlans(
      [record({ milestones: [{ level: 5, typeID: 3327 }] })],
      SKILLS,
      FACTIONS
    );
    expect(plan.milestones).toEqual([]);
  });

  it('drops an out-of-range level', () => {
    const [plan] = bakeCertifiedPlans(
      [
        record({
          skillRequirements: [
            { level: 0, typeID: 3327 },
            { level: 6, typeID: 3413 },
            { level: 1, typeID: 3380 },
          ],
          milestones: [],
        }),
      ],
      SKILLS,
      FACTIONS
    );
    expect(plan.entries).toEqual([{ skillTypeID: 3380, level: 1 }]);
  });

  it('sorts by career path, then name', () => {
    const plans = bakeCertifiedPlans(
      [
        record({ _key: 1, careerPathID: 6, name: { en: 'Bounty Hunter' } }),
        record({ _key: 2, careerPathID: 5, name: { en: 'Salvager' } }),
        record({ _key: 3, careerPathID: 5, name: { en: 'Hauler' } }),
      ],
      SKILLS,
      FACTIONS
    );
    expect(plans.map((p) => p.id)).toEqual([3, 2, 1]);
  });
});
