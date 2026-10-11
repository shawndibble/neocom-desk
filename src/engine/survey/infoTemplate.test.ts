import { describe, expect, it } from 'vitest';
import {
  applyTemplate,
  deleteTemplate,
  findTemplateByName,
  heldInclude,
  insertTemplate,
  isEdited,
  parseInfoTemplates,
  renameTemplate,
  saveTemplate,
  templateFields,
  templateSummary,
  TEMPLATE_MAX,
  TEMPLATE_NAME_MAX,
  type InfoFields,
  type InfoTemplate,
} from './infoTemplate';

const EFA: InfoTemplate = {
  id: 'a',
  name: 'Efa moon 4',
  location: { id: 40001, name: 'Efa IX - Moon 4' },
  tax: { name: 'Snowfall Mining Corp', pct: 8 },
  notes: 'Dock at the **refinery**',
};
const BELT: InfoTemplate = { id: 'b', name: 'Talidal belt', notes: 'Stay in the belt' };

const CURRENT: InfoFields = {
  location: { id: 40001, name: 'Efa IX - Moon 4' },
  tax: { name: 'Snowfall Mining Corp', pct: 8 },
  notes: 'Dock at the **refinery**',
};

describe('parseInfoTemplates', () => {
  it('keeps well-formed templates, with only the fields they hold', () => {
    expect(parseInfoTemplates([EFA, BELT])).toEqual([EFA, BELT]);
  });

  it('drops malformed templates, bad fields and duplicate ids', () => {
    const raw = [
      null,
      7,
      { id: 'x' },
      { id: 'y', name: '   ' },
      { id: 'd', name: 'Dup' },
      { ...EFA, tax: { name: 'Nobody', pct: 140 }, location: { id: 'x', name: 'Bad' } },
    ];
    expect(parseInfoTemplates([BELT, ...raw, { id: 'b', name: 'Again' }])).toEqual([
      BELT,
      { id: 'd', name: 'Dup' },
      { id: EFA.id, name: EFA.name, notes: EFA.notes },
    ]);
  });

  it('accepts a manual location with a null id', () => {
    const manual = { id: 'm', name: 'Moro', location: { id: null, name: 'Moro' } };
    expect(parseInfoTemplates([manual])).toEqual([manual]);
  });

  it('caps the name and the list', () => {
    const long = parseInfoTemplates([{ id: 'l', name: 'x'.repeat(TEMPLATE_NAME_MAX + 20) }]);
    expect(long[0]?.name).toHaveLength(TEMPLATE_NAME_MAX);
    const many = Array.from({ length: TEMPLATE_MAX + 5 }, (_, i) => ({
      id: `t${i}`,
      name: `T${i}`,
    }));
    expect(parseInfoTemplates(many)).toHaveLength(TEMPLATE_MAX);
  });

  it('is empty for anything that is not a list', () => {
    expect(parseInfoTemplates('nope')).toEqual([]);
    expect(parseInfoTemplates(undefined)).toEqual([]);
  });
});

describe('templateFields', () => {
  it('keeps only the fields the pilot included, and only ones that are set', () => {
    expect(templateFields(CURRENT, { location: true, tax: false, notes: true })).toEqual({
      location: CURRENT.location,
      notes: CURRENT.notes,
    });
    expect(
      templateFields(
        { location: null, tax: null, notes: '  ' },
        { location: true, tax: true, notes: true }
      )
    ).toEqual({});
  });

  it('trims the notes', () => {
    expect(
      templateFields({ ...CURRENT, notes: ' hi \n' }, { location: false, tax: false, notes: true })
    ).toEqual({ notes: 'hi' });
  });
});

describe('applyTemplate', () => {
  const blank: InfoFields = { location: null, tax: null, notes: '' };

  it('fills every field the template holds', () => {
    expect(applyTemplate(EFA, blank, { moon: true })).toEqual(CURRENT);
  });

  it('leaves alone a field the template does not hold', () => {
    expect(applyTemplate(BELT, CURRENT, { moon: true })).toEqual({
      ...CURRENT,
      notes: 'Stay in the belt',
    });
  });

  it('leaves the tax alone when the survey shows no moon ore', () => {
    expect(applyTemplate(EFA, blank, { moon: false }).tax).toBeNull();
  });
});

describe('isEdited', () => {
  it('is false when every field the template holds matches', () => {
    expect(isEdited(EFA, CURRENT, { moon: true })).toBe(false);
    expect(isEdited(BELT, { ...CURRENT, notes: ' Stay in the belt ' }, { moon: true })).toBe(false);
  });

  it('ignores fields the template does not hold', () => {
    expect(
      isEdited(BELT, { ...CURRENT, notes: 'Stay in the belt', location: null }, { moon: true })
    ).toBe(false);
  });

  it('is true when a held field differs', () => {
    expect(isEdited(EFA, { ...CURRENT, notes: 'Other' }, { moon: true })).toBe(true);
    expect(isEdited(EFA, { ...CURRENT, location: null }, { moon: true })).toBe(true);
    expect(
      isEdited(EFA, { ...CURRENT, tax: { name: 'Snowfall Mining Corp', pct: 9 } }, { moon: true })
    ).toBe(true);
    expect(isEdited(EFA, { ...CURRENT, tax: null }, { moon: true })).toBe(true);
  });

  it('does not count the tax without a moon ore', () => {
    expect(isEdited(EFA, { ...CURRENT, tax: null }, { moon: false })).toBe(false);
  });
});

describe('templateSummary', () => {
  it('names the location, the tax and whether there are notes', () => {
    expect(templateSummary(EFA)).toEqual({
      location: 'Efa IX - Moon 4',
      tax: { name: 'Snowfall Mining Corp', pct: 8 },
      hasNotes: true,
    });
    expect(templateSummary(BELT)).toEqual({ location: null, tax: null, hasNotes: true });
  });
});

describe('heldInclude', () => {
  it('names the fields a template holds, the tax only with a moon ore', () => {
    expect(heldInclude(EFA, { moon: true })).toEqual({ location: true, tax: true, notes: true });
    expect(heldInclude(EFA, { moon: false })).toEqual({ location: true, tax: false, notes: true });
    expect(heldInclude(BELT, { moon: true })).toEqual({ location: false, tax: false, notes: true });
  });
});

describe('findTemplateByName', () => {
  it('finds a template by name in any case, and nothing for a blank name', () => {
    expect(findTemplateByName([EFA, BELT], ' talidal BELT ')).toBe(BELT);
    expect(findTemplateByName([EFA, BELT], 'Ice')).toBeUndefined();
    expect(findTemplateByName([EFA, BELT], '  ')).toBeUndefined();
  });
});

describe('list edits', () => {
  it('saveTemplate adds a new one at the end', () => {
    const next = saveTemplate([EFA], { name: ' Ice ', fields: { notes: 'cold' } }, () => 'new');
    expect(next).toEqual([EFA, { id: 'new', name: 'Ice', notes: 'cold' }]);
  });

  it('saveTemplate replaces a template of the same name (any case), keeping its id and place', () => {
    const next = saveTemplate(
      [EFA, BELT],
      { name: 'talidal BELT', fields: { notes: 'new' } },
      () => 'x'
    );
    expect(next).toEqual([EFA, { id: 'b', name: 'talidal BELT', notes: 'new' }]);
  });

  it('saveTemplate keeps the newest when the list is full', () => {
    const full = Array.from({ length: TEMPLATE_MAX }, (_, i) => ({ id: `t${i}`, name: `T${i}` }));
    const next = saveTemplate(full, { name: 'Fresh', fields: {} }, () => 'fresh');
    expect(next).toHaveLength(TEMPLATE_MAX);
    expect(next.at(-1)?.id).toBe('fresh');
    expect(next[0]?.id).toBe('t1');
  });

  it('updating by id swaps its fields but keeps its name', () => {
    const next = saveTemplate(
      [EFA],
      { id: 'a', name: EFA.name, fields: { notes: 'changed' } },
      () => 'x'
    );
    expect(next).toEqual([{ id: 'a', name: EFA.name, notes: 'changed' }]);
  });

  it('renameTemplate renames, ignoring a blank name', () => {
    expect(renameTemplate([EFA], 'a', ' Moon four ')[0]?.name).toBe('Moon four');
    expect(renameTemplate([EFA], 'a', '   ')).toEqual([EFA]);
  });

  it('deleteTemplate removes it, and insertTemplate puts it back where it was', () => {
    const list = [EFA, BELT];
    expect(deleteTemplate(list, 'a')).toEqual([BELT]);
    expect(insertTemplate([BELT], EFA, 0)).toEqual(list);
    expect(insertTemplate([BELT], EFA, 9)).toEqual([BELT, EFA]);
    expect(insertTemplate(list, EFA, 0)).toEqual(list);
  });
});
