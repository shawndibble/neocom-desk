import { execFileSync } from 'node:child_process';
import { Readable } from 'node:stream';
import unbzip2Stream from 'unbzip2-stream';
import { describe, expect, it } from 'vitest';
import { OpenPriceFold } from './marketOpenPrices.js';
import { foldOrdersCsv, parseIsBuy } from './marketOrdersArchive.js';

const HEADER =
  'duration,is_buy_order,issued,location_id,min_volume,order_id,price,range,system_id,type_id,volume_remain,volume_total,http_last_modified,station_id,region_id,constellation_id';
const row = (buy: boolean, price: number, type: number, region: number) =>
  `90,${buy},2026-09-18T15:01:18Z,60003760,1,1,${price},region,30000142,${type},5,5,2026-10-17T23:44:45Z,60003760,${region},20000020`;
const CSV = [
  HEADER,
  row(true, 5.5, 34, 10000002),
  row(true, 5.6, 34, 10000002),
  row(false, 6.1, 34, 10000002),
  row(false, 6.0, 34, 10000002),
  row(false, 7, 34, 10000001),
  '',
].join('\n');

describe('foldOrdersCsv', () => {
  it('folds a plain CSV stream by column name', async () => {
    const fold = new OpenPriceFold();
    const rows = await foldOrdersCsv(Readable.from([CSV]), fold);
    expect(rows).toBe(5);
    expect([...fold.entries()]).toEqual([{ regionId: 10000002, typeId: 34, buy: 5.6, sell: 6.0 }]);
  });

  it('survives chunk boundaries inside a row', async () => {
    const fold = new OpenPriceFold();
    await foldOrdersCsv(Readable.from([CSV.slice(0, 300), CSV.slice(300)]), fold);
    expect(fold.size).toBe(1);
  });

  it('streams through bzip2 decompression', async () => {
    const bz2 = execFileSync('bzip2', ['-c'], { input: CSV });
    const fold = new OpenPriceFold();
    await foldOrdersCsv(Readable.from([bz2]).pipe(unbzip2Stream()), fold);
    expect([...fold.entries()][0]).toMatchObject({ buy: 5.6, sell: 6.0 });
  });

  it('rejects a snapshot without the needed columns', async () => {
    await expect(foldOrdersCsv(Readable.from(['a,b\n1,2\n']), new OpenPriceFold())).rejects.toThrow(
      /missing a column/
    );
  });

  it('rejects, rather than ending quietly, when the source errors mid-stream', async () => {
    const source = new Readable({ read() {} });
    source.push(CSV.slice(0, 400));
    const fold = new OpenPriceFold();
    const done = foldOrdersCsv(source, fold);
    setTimeout(() => source.destroy(new Error('connection reset')), 10);
    await expect(done).rejects.toThrow('connection reset');
  });

  it('rejects when the bzip2 stream is corrupt or truncated', async () => {
    const bz2 = execFileSync('bzip2', ['-c'], { input: CSV.repeat(200) });
    const cut = bz2.subarray(0, Math.floor(bz2.length / 2));
    await expect(
      foldOrdersCsv(Readable.from([cut]).pipe(unbzip2Stream()), new OpenPriceFold())
    ).rejects.toThrow();
  });

  it('fails the run on an unknown is_buy_order value', async () => {
    const bad = CSV.replace('90,true,', '90,yes,');
    await expect(foldOrdersCsv(Readable.from([bad]), new OpenPriceFold())).rejects.toThrow(
      /is_buy_order/
    );
  });
});

describe('parseIsBuy', () => {
  it('accepts any casing of true and false and nothing else', () => {
    expect(['true', 'True', 'TRUE'].map(parseIsBuy)).toEqual([true, true, true]);
    expect(['false', 'False', 'FALSE'].map(parseIsBuy)).toEqual([false, false, false]);
    for (const v of ['', '1', '0', 'yes', undefined]) expect(() => parseIsBuy(v)).toThrow();
  });
});
