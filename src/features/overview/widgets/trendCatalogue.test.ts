import { describe, expect, it } from 'vitest';
import type { MarketGroupNode, MarketTypeEntry } from '@/sde/marketTypes';
import { trendCatalogue, TREND_PLEX_IDS, TREND_SOURCE_IDS } from './trendCatalogue';

const group = (
  id: number,
  name: string,
  parentId: number | null,
  hasTypes = true
): MarketGroupNode => ({
  id,
  name,
  parentId,
  hasTypes,
});
const type = (typeId: number, name: string, marketGroupId: number): MarketTypeEntry => ({
  typeId,
  name,
  marketGroupId,
  volume: 1,
});

const groups = [
  group(533, 'Materials', null, false),
  group(1857, 'Minerals', 533),
  group(1033, 'Ice Products', 533),
  group(1031, 'Raw Materials', 533, false),
  group(54, 'Standard Ores', 1031, false),
  group(518, 'Veldspar', 54),
  group(519, 'Scordite', 54),
  group(3849, 'Empire Ores', 54),
  group(1855, 'Ice Ores', 1031),
  group(2395, 'Moon Ores', 1031, false),
  group(2396, 'Ubiquitous Moon Ores', 2395),
  group(2358, 'Skill Injectors', null),
];
const types = [
  type(35, 'Pyerite', 1857),
  type(34, 'Tritanium', 1857),
  type(16272, 'Heavy Water', 1033),
  type(1230, 'Veldspar', 518),
  type(17470, 'Veldspar II-Grade', 518),
  type(28430, 'Compressed Veldspar', 518),
  type(1228, 'Scordite', 519),
  type(28431, 'Compressed Scordite', 519),
  type(28432, 'Compressed Scordite II-Grade', 519),
  type(3001, 'Raspite X-Grade', 3849),
  type(3002, 'Compressed Raspite X-Grade', 3849),
  type(16262, 'Clear Icicle', 1855),
  type(17978, 'Clear Icicle IV-Grade', 1855),
  type(28434, 'Compressed Clear Icicle', 1855),
  type(28435, 'Compressed Clear Icicle IV-Grade', 1855),
  type(45490, 'Zeolites', 2396),
  type(46280, 'Brimful Zeolites', 2396),
  type(46281, 'Glistening Zeolites', 2396),
  type(62454, 'Compressed Zeolites', 2396),
  type(62455, 'Compressed Brimful Zeolites', 2396),
  type(44992, 'PLEX', 1923),
  type(40520, 'Large Skill Injector', 2358),
  type(45635, 'Small Skill Injector', 2358),
];

describe('trendCatalogue', () => {
  const sources = trendCatalogue(groups, types);
  const names = (id: string) => sources.find((s) => s.id === id)!.items.map((i) => i.name);

  it('lists the minerals by name', () => {
    expect(names('minerals')).toEqual(['Pyerite', 'Tritanium']);
  });

  it('lists the ice products', () => {
    expect(names('ice')).toEqual(['Heavy Water']);
  });

  it('lists one raw ore per ore group, not its grades or compressed forms', () => {
    expect(names('ore')).toEqual(['Raspite X-Grade', 'Scordite', 'Veldspar']);
  });

  it('lists the plain compressed form of each ore, not its grades', () => {
    expect(names('compressedOre')).toEqual([
      'Compressed Raspite X-Grade',
      'Compressed Scordite',
      'Compressed Veldspar',
    ]);
  });

  it('lists the base-grade ice ores, raw and compressed', () => {
    expect(names('iceOre')).toEqual(['Clear Icicle']);
    expect(names('compressedIceOre')).toEqual(['Compressed Clear Icicle']);
  });

  it('lists one moon ore per ore, not its richer variants', () => {
    expect(names('moonOre')).toEqual(['Zeolites']);
    expect(names('compressedMoonOre')).toEqual(['Compressed Zeolites']);
  });

  it('exports every source id once, in the order the catalogue lists them', () => {
    expect(sources.map((s) => s.id)).toEqual([...TREND_SOURCE_IDS]);
  });

  it('pairs PLEX with the injectors', () => {
    expect(TREND_PLEX_IDS).toContain(44992);
    expect(names('plex')).toEqual(['PLEX', 'Large Skill Injector', 'Small Skill Injector']);
  });

  it('leaves out a source whose items the catalogue does not have', () => {
    expect(trendCatalogue([], []).map((s) => s.items.length)).toEqual(
      TREND_SOURCE_IDS.map(() => 0)
    );
  });
});
