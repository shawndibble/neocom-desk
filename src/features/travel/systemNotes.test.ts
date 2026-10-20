import { describe, expect, it } from 'vitest';
import {
  SYSTEM_NOTE_MAX_LENGTH,
  noteFirstLine,
  parseSystemNotes,
  withSystemNote,
} from './systemNotes';

describe('parseSystemNotes', () => {
  it('keeps well-formed notes', () => {
    const raw = { '30002813': { text: 'gate camp seen', updatedAt: 1000 } };
    expect(parseSystemNotes(raw)).toEqual({
      30002813: { text: 'gate camp seen', updatedAt: 1000 },
    });
  });

  /* Written by another device, maybe another build: a bad entry costs only itself. */
  it('drops malformed entries', () => {
    const raw = {
      '30002813': { text: 'ok', updatedAt: 5 },
      abc: { text: 'bad id', updatedAt: 5 },
      '-4': { text: 'negative', updatedAt: 5 },
      '30000142': { text: 12, updatedAt: 5 },
      '30000144': { text: 'no date' },
      '30000145': { text: '', updatedAt: 5 },
      '30000146': null,
    };
    expect(Object.keys(parseSystemNotes(raw))).toEqual(['30002813']);
  });

  it('truncates text past the cap', () => {
    const parsed = parseSystemNotes({
      '30002813': { text: 'x'.repeat(SYSTEM_NOTE_MAX_LENGTH + 20), updatedAt: 5 },
    });
    expect(parsed[30002813].text).toHaveLength(SYSTEM_NOTE_MAX_LENGTH);
  });

  it('reads anything that is not an object as no notes', () => {
    expect(parseSystemNotes([1, 2])).toEqual({});
    expect(parseSystemNotes(null)).toEqual({});
    expect(parseSystemNotes('x')).toEqual({});
  });
});

describe('withSystemNote', () => {
  it('adds a trimmed note stamped with the time', () => {
    expect(withSystemNote({}, 30002813, '  safe spot  ', 42)).toEqual({
      30002813: { text: 'safe spot', updatedAt: 42 },
    });
  });

  it('caps the text', () => {
    const next = withSystemNote({}, 1, 'y'.repeat(SYSTEM_NOTE_MAX_LENGTH + 5), 1);
    expect(next[1].text).toHaveLength(SYSTEM_NOTE_MAX_LENGTH);
  });

  it('deletes the note when the text is empty', () => {
    const notes = { 1: { text: 'a', updatedAt: 1 }, 2: { text: 'b', updatedAt: 1 } };
    expect(withSystemNote(notes, 1, '   ', 9)).toEqual({ 2: { text: 'b', updatedAt: 1 } });
  });

  it('returns the same object when nothing changed, so the date stays put', () => {
    const notes = { 1: { text: 'a', updatedAt: 1 } };
    expect(withSystemNote(notes, 1, 'a', 99)).toBe(notes);
    expect(withSystemNote(notes, 2, '', 99)).toBe(notes);
  });
});

describe('noteFirstLine', () => {
  it('returns the first non-empty line', () => {
    expect(noteFirstLine('\nfirst\nsecond')).toBe('first');
  });
});
