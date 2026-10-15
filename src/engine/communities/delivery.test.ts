import { describe, expect, it } from 'vitest';
import {
  batchLines,
  eligibleContracts,
  matchDeliveries,
  MAX_CONTRACT_IDS_PER_LINE,
  pledgeEntryAfterManual,
  previousFromEntry,
  type ContractHeader,
  type DeliveryContract,
  type DeliverySlot,
} from './delivery';
import { withPledgeLine, type RequestLine } from './requests';

const ore: RequestLine = { typeId: 100, name: 'Reactive Metals', quantity: 500, kind: 'item' };
const bpc: RequestLine = {
  typeId: 200,
  name: 'Ishtar Blueprint',
  quantity: 2,
  kind: 'bpc',
  runs: 10,
};
const bpo: RequestLine = { typeId: 200, name: 'Ishtar Blueprint', quantity: 1, kind: 'bpo' };

const slot = (key: string, line: RequestLine, quantity: number, over: Partial<DeliverySlot> = {}) =>
  ({
    key,
    line,
    quantity,
    since: 0,
    requesterId: 22,
    order: [0, 0],
    previousAuto: 0,
    previousContractIds: [],
    ...over,
  }) as DeliverySlot;

const contract = (
  contractId: number,
  items: DeliveryContract['items'],
  completedAt = contractId,
  recipients: number[] = [22]
): DeliveryContract => ({ contractId, completedAt, recipients, items });

describe('matchDeliveries', () => {
  it('counts a finished contract of the right type against the Pledge', () => {
    const out = matchDeliveries(
      [slot('a', ore, 300)],
      [contract(1, [{ typeId: 100, quantity: 120, blueprint: null }])]
    );
    expect(out.get('a')).toMatchObject({ delivered: 120, contractIds: [1] });
  });

  it('adds up partial deliveries and never exceeds the Pledge', () => {
    const out = matchDeliveries(
      [slot('a', ore, 300)],
      [
        contract(1, [{ typeId: 100, quantity: 200, blueprint: null }]),
        contract(2, [{ typeId: 100, quantity: 200, blueprint: null }]),
      ]
    );
    expect(out.get('a')).toMatchObject({ delivered: 300, contractIds: [1, 2] });
  });

  it('does not record a contract that adds nothing once the Pledge is full', () => {
    const out = matchDeliveries(
      [slot('a', ore, 100)],
      [
        contract(1, [{ typeId: 100, quantity: 100, blueprint: null }]),
        contract(2, [{ typeId: 100, quantity: 50, blueprint: null }]),
      ]
    );
    expect(out.get('a')).toMatchObject({ delivered: 100, contractIds: [1] });
  });

  it('serves two lines from one contract', () => {
    const out = matchDeliveries(
      [slot('ore', ore, 300), slot('bpc', bpc, 2, { order: [0, 1] })],
      [
        contract(7, [
          { typeId: 100, quantity: 300, blueprint: null },
          { typeId: 200, quantity: 1, blueprint: 'copy', runs: 10 },
        ]),
      ]
    );
    expect(out.get('ore')).toMatchObject({ delivered: 300, contractIds: [7] });
    expect(out.get('bpc')).toMatchObject({ delivered: 1, contractIds: [7] });
  });

  it('allocates to the oldest Pledge first, spilling over to the next', () => {
    const out = matchDeliveries(
      [slot('new', ore, 100, { order: [0, 2] }), slot('old', ore, 100, { order: [0, 1] })],
      [contract(1, [{ typeId: 100, quantity: 150, blueprint: null }])]
    );
    expect(out.get('old')?.delivered).toBe(100);
    expect(out.get('new')?.delivered).toBe(50);
  });

  it('ignores contracts that finished before the Request was posted', () => {
    const out = matchDeliveries(
      [slot('a', ore, 100, { since: 1000 })],
      [contract(1, [{ typeId: 100, quantity: 100, blueprint: null }], 999)]
    );
    expect(out.get('a')?.delivered).toBe(0);
  });

  it('matches a BPC line only to copies and a BPO line only to originals', () => {
    const copy = contract(1, [{ typeId: 200, quantity: 1, blueprint: 'copy', runs: 10 }]);
    const original = contract(2, [{ typeId: 200, quantity: 1, blueprint: 'original' }]);
    const out = matchDeliveries([slot('bpc', bpc, 2), slot('bpo', bpo, 1)], [copy, original]);
    expect(out.get('bpc')).toMatchObject({ delivered: 1, contractIds: [1] });
    expect(out.get('bpo')).toMatchObject({ delivered: 1, contractIds: [2] });
  });

  it('counts a BPC with other attributes and flags the difference', () => {
    const out = matchDeliveries(
      [slot('bpc', bpc, 2)],
      [contract(5, [{ typeId: 200, quantity: 1, blueprint: 'copy', runs: 5 }])]
    );
    const result = out.get('bpc');
    expect(result?.delivered).toBe(1);
    expect(result?.flags).toEqual([{ contractId: 5, attribute: 'runs', asked: 10, got: 5 }]);
  });

  it('does not flag attributes the contract does not carry or the line did not ask for', () => {
    const out = matchDeliveries(
      [slot('bpc', { ...bpc, runs: undefined }, 2)],
      [contract(5, [{ typeId: 200, quantity: 1, blueprint: 'copy', runs: 10 }])]
    );
    expect(out.get('bpc')?.flags).toEqual([]);
  });

  it('is idempotent: the same contracts give the same answer, fed back as previous state', () => {
    const contracts = [contract(1, [{ typeId: 100, quantity: 120, blueprint: null }])];
    const first = matchDeliveries([slot('a', ore, 300)], contracts).get('a')!;
    const again = matchDeliveries(
      [
        slot('a', ore, 300, {
          previousAuto: first.delivered,
          previousContractIds: first.contractIds,
        }),
      ],
      contracts
    ).get('a')!;
    expect(again.delivered).toBe(120);
    expect(again.contractIds).toEqual([1]);
  });

  it('keeps what an earlier run recorded when the contract has aged out of ESI', () => {
    const out = matchDeliveries(
      [slot('a', ore, 300, { previousAuto: 120, previousContractIds: [1] })],
      []
    );
    expect(out.get('a')).toMatchObject({ delivered: 120, contractIds: [1] });
  });

  it('adds a new contract on top of one that has aged out of ESI', () => {
    const out = matchDeliveries(
      [slot('a', ore, 100, { previousAuto: 40, previousContractIds: [1] })],
      [contract(2, [{ typeId: 100, quantity: 30, blueprint: null }])]
    );
    expect(out.get('a')).toMatchObject({ delivered: 70, contractIds: [1, 2] });
  });

  it('does not count a recorded contract again while ESI still shows it', () => {
    const contracts = [
      contract(1, [{ typeId: 100, quantity: 40, blueprint: null }]),
      contract(2, [{ typeId: 100, quantity: 30, blueprint: null }]),
    ];
    const out = matchDeliveries(
      [slot('a', ore, 100, { previousAuto: 40, previousContractIds: [1] })],
      contracts
    );
    expect(out.get('a')?.delivered).toBe(70);
    const again = matchDeliveries(
      [slot('a', ore, 100, { previousAuto: 70, previousContractIds: [1, 2] })],
      contracts
    );
    expect(again.get('a')?.delivered).toBe(70);
  });

  it('caps the aged-out figure plus new contracts at the Pledge', () => {
    const out = matchDeliveries(
      [slot('a', ore, 100, { previousAuto: 90, previousContractIds: [1] })],
      [contract(2, [{ typeId: 100, quantity: 30, blueprint: null }])]
    );
    expect(out.get('a')?.delivered).toBe(100);
  });

  it('does not double count contracts whose ids were trimmed from the recorded list', () => {
    const contracts = Array.from({ length: MAX_CONTRACT_IDS_PER_LINE + 5 }, (_, i) =>
      contract(i + 1, [{ typeId: 100, quantity: 1, blueprint: null }])
    );
    const first = matchDeliveries([slot('a', ore, 1000)], contracts).get('a')!;
    expect(first.contractIds).toHaveLength(MAX_CONTRACT_IDS_PER_LINE);
    const again = matchDeliveries(
      [
        slot('a', ore, 1000, {
          previousAuto: first.auto,
          previousThrough: first.through,
          previousContractIds: first.contractIds,
        }),
      ],
      contracts
    ).get('a')!;
    expect(again.delivered).toBe(MAX_CONTRACT_IDS_PER_LINE + 5);
  });

  it('does not recredit a contract to another Pledge once its id has been trimmed', () => {
    const A = contract(7, [{ typeId: 100, quantity: 40, blueprint: null }], 10);
    const newer = Array.from({ length: MAX_CONTRACT_IDS_PER_LINE + 1 }, (_, i) =>
      contract(100 + i, [{ typeId: 100, quantity: 1, blueprint: null }], 20 + i)
    );
    const first = matchDeliveries([slot('r1', ore, 1000, { order: [2, 0] })], [A, ...newer]).get(
      'r1'
    )!;
    expect(first.contractIds).not.toContain(7);
    const out = matchDeliveries(
      [
        slot('r0', ore, 1000, { order: [1, 0] }),
        slot('r1', ore, 1000, {
          order: [2, 0],
          previousAuto: first.auto,
          previousThrough: first.through,
          previousContractIds: first.contractIds,
        }),
      ],
      [A, ...newer]
    );
    expect(out.get('r0')?.delivered).toBe(0);
    expect(out.get('r1')?.delivered).toBe(40 + MAX_CONTRACT_IDS_PER_LINE + 1);
  });

  it('does not let a newer Request, pledged later, recredit what an older one recorded', () => {
    const a = contract(7, [{ typeId: 100, quantity: 40, blueprint: null }], 50);
    const out = matchDeliveries(
      [
        slot('r0', ore, 100, {
          order: [1, 0],
          previousAuto: 40,
          previousThrough: 50,
          previousContractIds: [7],
        }),
        slot('r1', ore, 100, { order: [2, 0] }),
      ],
      [a]
    );
    expect(out.get('r0')?.delivered).toBe(40);
    expect(out.get('r1')?.delivered).toBe(0);
  });

  it('credits the other item of a multi-item contract to the line that asks for it', () => {
    const other: RequestLine = { typeId: 101, name: 'Other', quantity: 5, kind: 'item' };
    const A = contract(
      7,
      [
        { typeId: 100, quantity: 5, blueprint: null },
        { typeId: 101, quantity: 5, blueprint: null },
      ],
      10
    );
    const out = matchDeliveries(
      [
        slot('l0', { ...ore, quantity: 5 }, 5, {
          previousAuto: 5,
          previousThrough: 10,
          previousContractIds: [7],
        }),
        slot('l1', other, 5, { order: [0, 1] }),
      ],
      [A]
    );
    expect(out.get('l0')?.delivered).toBe(5);
    expect(out.get('l1')?.delivered).toBe(5);
  });

  it('counts a late contract whose id is below a full recorded list', () => {
    const ids = Array.from({ length: MAX_CONTRACT_IDS_PER_LINE }, (_, i) => 5000 + i);
    const out = matchDeliveries(
      [
        slot('a', ore, 1000, {
          previousAuto: 60,
          previousThrough: 100,
          previousContractIds: ids,
        }),
      ],
      [contract(4990, [{ typeId: 100, quantity: 30, blueprint: null }], 200)]
    ).get('a')!;
    expect(out.delivered).toBe(90);
    expect(out.auto).toBe(90);
    expect(out.through).toBe(200);
  });

  it('keeps the contract figure under a larger typed amount once the contract has aged out', () => {
    const typed = {
      quantity: 300,
      delivered: 50,
      contractIds: [1],
      manual: 50,
      auto: 40,
      through: 5,
    };
    const cleared = pledgeEntryAfterManual(typed, 0);
    expect(cleared.delivered).toBe(40);
    const out = matchDeliveries([slot('a', ore, 300, previousFromEntry(cleared))], []);
    expect(out.get('a')?.delivered).toBe(40);
  });

  it('does not zero the contract base when the typed amount equals it', () => {
    const entry = {
      quantity: 300,
      delivered: 40,
      contractIds: [1],
      manual: 40,
      auto: 40,
      through: 5,
    };
    const out = matchDeliveries([slot('a', ore, 300, previousFromEntry(entry))], []);
    expect(out.get('a')).toMatchObject({ delivered: 40, auto: 40 });
    expect(pledgeEntryAfterManual(entry, 0).delivered).toBe(40);
  });

  it('restores the contract figure when a lowered Pledge is raised back', () => {
    const lowered = withPledgeLine(
      { 0: { quantity: 100, delivered: 80, contractIds: [1], auto: 80, through: 5 } },
      0,
      30
    );
    expect(lowered[0]).toMatchObject({ delivered: 30, auto: 80 });
    const raised = withPledgeLine(lowered, 0, 100);
    expect(raised[0]).toMatchObject({ delivered: 80, auto: 80 });
    const out = matchDeliveries([slot('a', ore, 30, previousFromEntry(lowered[0]))], []);
    expect(out.get('a')).toMatchObject({ delivered: 30, auto: 80 });
  });

  it('counts a contract toward one Pledge: an older Request does not take what a newer one recorded', () => {
    const a = contract(7, [{ typeId: 100, quantity: 40, blueprint: null }], 50);
    const out = matchDeliveries(
      [
        slot('r0', ore, 100, { order: [1, 0] }),
        slot('r1', ore, 100, {
          order: [2, 0],
          previousAuto: 40,
          previousThrough: 50,
          previousContractIds: [7],
        }),
      ],
      [a]
    );
    expect(out.get('r1')?.delivered).toBe(40);
    expect(out.get('r0')?.delivered).toBe(0);
  });

  it('counts nothing finished at or after a contract it could not read, run after run', () => {
    // X (finished at 100) is unreadable; 12 later contracts of 10 each.
    const later = Array.from({ length: 12 }, (_, i) =>
      contract(200 + i, [{ typeId: 100, quantity: 10, blueprint: null }], 101 + i)
    );
    let entry = {
      previousAuto: 0,
      previousContractIds: [] as number[],
      previousThrough: undefined as number | undefined,
    };
    for (let run = 0; run < 3; run += 1) {
      const out = matchDeliveries(
        [slot('a', ore, 1000, entry.previousThrough === undefined ? {} : entry)],
        later,
        { horizon: 100 }
      ).get('a')!;
      expect(out.delivered).toBe(0);
      entry = {
        previousAuto: out.auto,
        previousContractIds: out.contractIds,
        previousThrough: out.through,
      };
    }
  });

  it('counts the contracts once the horizon moves, and then stays stable', () => {
    const later = Array.from({ length: 12 }, (_, i) =>
      contract(200 + i, [{ typeId: 100, quantity: 10, blueprint: null }], 101 + i)
    );
    let entry: Partial<DeliverySlot> = {};
    for (let run = 0; run < 3; run += 1) {
      const out = matchDeliveries([slot('a', ore, 1000, entry)], later).get('a')!;
      expect(out.delivered).toBe(120);
      entry = {
        previousAuto: out.auto,
        previousContractIds: out.contractIds,
        previousThrough: out.through,
      };
    }
  });

  it('keeps the most recent contract ids when more than the cap match', () => {
    const contracts = Array.from({ length: MAX_CONTRACT_IDS_PER_LINE + 5 }, (_, i) =>
      contract(i + 1, [{ typeId: 100, quantity: 1, blueprint: null }])
    );
    const out = matchDeliveries([slot('a', ore, 1000)], contracts).get('a')!;
    expect(out.delivered).toBe(MAX_CONTRACT_IDS_PER_LINE + 5);
    expect(out.contractIds).toHaveLength(MAX_CONTRACT_IDS_PER_LINE);
    expect(out.contractIds.at(-1)).toBe(MAX_CONTRACT_IDS_PER_LINE + 5);
  });

  it('lets a typed amount stand when contracts show less, never adding the two', () => {
    const contracts = [contract(1, [{ typeId: 100, quantity: 50, blueprint: null }])];
    expect(
      matchDeliveries([slot('a', ore, 300, { manual: 200 })], contracts).get('a')?.delivered
    ).toBe(200);
    expect(
      matchDeliveries([slot('a', ore, 300, { manual: 20 })], contracts).get('a')?.delivered
    ).toBe(50);
  });

  it('caps a typed amount at the Pledge', () => {
    expect(matchDeliveries([slot('a', ore, 300, { manual: 900 })], []).get('a')?.delivered).toBe(
      300
    );
  });
});

describe('requesters', () => {
  const item = [{ typeId: 100, quantity: 50, blueprint: null }] as const;
  const slots = [
    slot('x', ore, 100, { requesterId: 1, order: [1, 0] }),
    slot('y', ore, 100, { requesterId: 2, order: [2, 0] }),
  ];

  it('credits only the slot of the pilot the contract went to', () => {
    const toX = matchDeliveries(slots, [contract(1, [...item], 1, [1])]);
    expect(toX.get('x')?.delivered).toBe(50);
    expect(toX.get('y')?.delivered).toBe(0);
    const toY = matchDeliveries(slots, [contract(2, [...item], 2, [2])]);
    expect(toY.get('x')?.delivered).toBe(0);
    expect(toY.get('y')?.delivered).toBe(50);
  });

  it('allocates per requester: a spill-over never reaches another requester', () => {
    const out = matchDeliveries(slots, [
      contract(3, [{ typeId: 100, quantity: 150, blueprint: null }], 3, [1]),
    ]);
    expect(out.get('x')?.delivered).toBe(100);
    expect(out.get('y')?.delivered).toBe(0);
  });
});

describe('clearing a typed amount', () => {
  it('lets the contract figure come back on the next run', () => {
    const typed = { quantity: 300, delivered: 50, contractIds: [1], manual: 50 };
    const cleared = pledgeEntryAfterManual(typed, 0);
    expect(cleared.delivered).toBe(0);
    const out = matchDeliveries(
      [slot('a', ore, 300, previousFromEntry(cleared))],
      [contract(1, [{ typeId: 100, quantity: 50, blueprint: null }])]
    );
    expect(out.get('a')?.delivered).toBe(50);
  });

  it('caps a typed amount at the Pledge', () => {
    expect(pledgeEntryAfterManual({ quantity: 10, delivered: 0 }, 99)).toMatchObject({
      delivered: 10,
      manual: 10,
    });
  });
});

describe('pledgeEntryAfterManual', () => {
  it('records the amount and takes the larger of it and the contract figure', () => {
    expect(
      pledgeEntryAfterManual({ quantity: 300, delivered: 120, contractIds: [1] }, 200)
    ).toEqual({ quantity: 300, delivered: 200, contractIds: [1], manual: 200, auto: 120 });
    expect(pledgeEntryAfterManual({ quantity: 300, delivered: 120, contractIds: [1] }, 50)).toEqual(
      { quantity: 300, delivered: 120, contractIds: [1], manual: 50, auto: 120 }
    );
  });

  it('clears the typed amount with 0, falling back to what contracts showed', () => {
    const typed = { quantity: 300, delivered: 200, contractIds: [], manual: 200 };
    expect(pledgeEntryAfterManual(typed, 0)).toEqual({
      quantity: 300,
      delivered: 0,
      contractIds: [],
    });
  });
});

describe('eligibleContracts', () => {
  const base: ContractHeader = {
    contract_id: 1,
    issuer_id: 10,
    assignee_id: 20,
    acceptor_id: 20,
    type: 'item_exchange',
    status: 'finished',
    for_corporation: false,
    date_issued: '2026-10-01T00:00:00Z',
    date_completed: '2026-10-02T00:00:00Z',
  };
  const pick = (over: Partial<ContractHeader>) =>
    eligibleContracts([{ ...base, ...over }], 10, new Set([20]), 0).length;

  it('takes my finished item-exchange contract to a requester', () => {
    expect(pick({})).toBe(1);
    expect(pick({ status: 'finished_issuer' })).toBe(1);
  });

  it('refuses everything else', () => {
    expect(pick({ issuer_id: 99 })).toBe(0);
    expect(pick({ assignee_id: 30, acceptor_id: 30 })).toBe(0);
    expect(pick({ type: 'courier' })).toBe(0);
    expect(pick({ status: 'outstanding' })).toBe(0);
    expect(pick({ status: 'cancelled' })).toBe(0);
    expect(pick({ for_corporation: true })).toBe(0);
  });

  it('drops contracts completed before the window opens', () => {
    const since = Date.parse('2026-10-03T00:00:00Z');
    expect(eligibleContracts([base], 10, new Set([20]), since)).toHaveLength(0);
  });
});

describe('batchLines', () => {
  const light = (index: number) => ({
    index,
    entry: { quantity: 5, delivered: 1, contractIds: [1] },
  });
  const heavy = (index: number) => ({
    index,
    entry: {
      quantity: 5,
      delivered: 1,
      contractIds: Array.from({ length: 10 }, (_, i) => i + 1),
      manual: 1,
      auto: 1,
      through: 1,
    },
  });

  it('groups light lines four at a time', () => {
    const batches = batchLines([1, 2, 3, 4, 5, 6, 7, 8, 9].map(light));
    expect(batches.map((b) => b.length)).toEqual([3, 3, 3]);
    expect(batchLines([])).toEqual([]);
  });

  it('never puts more than four lines in one write', () => {
    const empty = (index: number) => ({
      index,
      entry: { quantity: 5, delivered: 0, contractIds: [] },
    });
    expect(batchLines([1, 2, 3, 4, 5, 6, 7, 8, 9].map(empty)).map((b) => b.length)).toEqual([
      4, 4, 1,
    ]);
  });

  it('puts a full 10-id line in a write of its own', () => {
    const batches = batchLines([light(0), heavy(1), light(2)]);
    expect(batches.map((b) => b.map((l) => l.index))).toEqual([[0], [1], [2]]);
  });
});
