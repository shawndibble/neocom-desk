import { execFileSync } from 'node:child_process';
import { Readable } from 'node:stream';
import unbzip2Stream from 'unbzip2-stream';
import { describe, expect, it } from 'vitest';
import { OpenPriceFold } from './marketOpenPrices.js';
import { foldOrdersCsv } from './marketOrdersArchive.js';

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
});
