import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { PHONE_TILES, QUESTION_TILES } from './questionTiles';
import { SHOWCASE_TABS } from './showcaseTabs';

/** Every capture the landing page references, in page order. */
function referencedFiles(): string[] {
  return [
    ...QUESTION_TILES.map((tile) => tile.shot.file),
    ...PHONE_TILES.map((tile) => tile.shot.file),
    ...SHOWCASE_TABS.map((tab) => tab.shot.file),
  ];
}

describe('landing screenshots', () => {
  it('uses each capture once on the whole page', () => {
    const files = referencedFiles();
    const duplicates = files.filter((file, index) => files.indexOf(file) !== index);
    expect(duplicates).toEqual([]);
  });

  it('gives each capture its own alt-text key, and ships no capture the page does not use', () => {
    const keys = [
      ...QUESTION_TILES.map((tile) => tile.shot.key),
      ...PHONE_TILES.map((tile) => tile.shot.key),
      ...SHOWCASE_TABS.map((tab) => tab.shot.key),
    ];
    expect(new Set(keys).size).toBe(keys.length);
    const onDisk = readdirSync(resolve(process.cwd(), 'public/screenshots'))
      .filter((name) => name.endsWith('.webp'))
      .map((name) => name.replace(/\.webp$/, ''))
      .sort();
    expect(onDisk).toEqual([...referencedFiles()].sort());
  });
});
