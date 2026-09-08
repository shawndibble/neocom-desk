import { describe, it, expect } from 'vitest';
import { Readable } from 'node:stream';
import { pack as tarPack } from 'tar-stream';
import { streamContractsCsvEntries } from './publicContractsArchive.js';
import type { ContractRecord, ContractItemRecord } from './publicContracts.js';

const CONTRACTS_HEADER =
  'collateral,contract_id,date_expired,date_issued,days_to_complete,end_location_id,issuer_corporation_id,issuer_id,price,reward,start_location_id,title,type,volume,http_last_modified,region_id,station_id,system_id,constellation_id,for_corporation,buyout';

const ITEMS_HEADER =
  'is_blueprint_copy,is_included,item_id,material_efficiency,quantity,record_id,runs,time_efficiency,type_id,http_last_modified,contract_id';

const CONTRACTS_CSV = [
  CONTRACTS_HEADER,
  '0.0,1,2026-09-09T18:00:00Z,2026-08-11T18:10:34Z,0,,98745702,2120819548,5000000.0,0.0,60003760,"BPC bundle",item_exchange,10.0,2026-09-08T18:08:11Z,10000002,60003760,30000142,20000020,false,',
].join('\n');

const ITEMS_CSV = [ITEMS_HEADER, 'true,true,1,10,1,1001,3,18,32858,2026-09-01T11:31:43Z,1'].join(
  '\n'
);

/** A tar stream carrying `entries` in the given order — the archive minus its bzip2 wrapper. */
function tarStream(entries: [name: string, content: string][]): Readable {
  const pack = tarPack();
  for (const [name, content] of entries) pack.entry({ name }, content);
  pack.finalize();
  return pack as unknown as Readable;
}

function collect() {
  const contracts: ContractRecord[] = [];
  const items: ContractItemRecord[] = [];
  return {
    contracts,
    items,
    handlers: {
      onContract: (record: ContractRecord) => contracts.push(record),
      onItem: (record: ContractItemRecord) => items.push(record),
    },
  };
}

describe('streamContractsCsvEntries', () => {
  it('dispatches each wanted CSV row to its handler', async () => {
    const { contracts, items, handlers } = collect();
    await streamContractsCsvEntries(
      tarStream([
        ['meta.json', '{"datasource":"tranquility"}'],
        ['contracts.csv', CONTRACTS_CSV],
        ['contract_items.csv', ITEMS_CSV],
      ]),
      handlers
    );

    expect(contracts).toHaveLength(1);
    expect(contracts[0].contract_id).toBe('1');
    expect(contracts[0].type).toBe('item_exchange');
    expect(items).toHaveLength(1);
    expect(items[0].type_id).toBe('32858');
    expect(items[0].material_efficiency).toBe('10');
  });

  it('ignores archive entries this feature does not read', async () => {
    const { contracts, items, handlers } = collect();
    await streamContractsCsvEntries(
      tarStream([
        ['meta.json', '{}'],
        ['contracts.csv', CONTRACTS_CSV],
        ['contract_items.csv', ITEMS_CSV],
        ['contract_bids.csv', 'amount,bidder_id\n1.0,2'],
      ]),
      handlers
    );

    expect(contracts).toHaveLength(1);
    expect(items).toHaveLength(1);
  });

  /**
   * The two CSVs we read are entries 2 and 3 of 7; the rest unpack to ~19MB
   * we would otherwise decompress only to discard. Abandoning the source is
   * how that work is skipped, so it is worth pinning.
   */
  it('stops reading the archive once both wanted entries are done', async () => {
    const { handlers } = collect();
    const source = tarStream([
      ['contracts.csv', CONTRACTS_CSV],
      ['contract_items.csv', ITEMS_CSV],
      ['contract_dynamic_items_dogma_attributes.csv', 'a,b\n1,2'],
    ]);

    await streamContractsCsvEntries(source, handlers);

    expect(source.destroyed).toBe(true);
  });

  /**
   * Items are joined against a contract map built from the entry before them,
   * so a reordered archive would silently yield zero rows — the exact
   * "synced, but empty" state this sync is supposed to make impossible.
   */
  it('fails loudly if the items entry arrives before the contracts entry', async () => {
    const { handlers } = collect();
    await expect(
      streamContractsCsvEntries(
        tarStream([
          ['contract_items.csv', ITEMS_CSV],
          ['contracts.csv', CONTRACTS_CSV],
        ]),
        handlers
      )
    ).rejects.toThrow(/contract_items\.csv/);
  });

  it('fails when the archive is missing an entry it needs', async () => {
    const { handlers } = collect();
    await expect(
      streamContractsCsvEntries(tarStream([['contracts.csv', CONTRACTS_CSV]]), handlers)
    ).rejects.toThrow(/missing/i);
  });
});
