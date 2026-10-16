import { describe, it, expect } from 'vitest';
import {
  encodeFittingShare,
  decodeFittingShare,
  FITTING_SHARE_VERSION,
  LEGACY_FITTING_SHARE_VERSION,
  MAX_FIT_NAME_LENGTH,
  MAX_SLOTS_PER_CATEGORY,
  MAX_DRONE_STACKS,
  MAX_FIGHTERS,
  MAX_CARGO_ITEMS,
  MAX_IMPLANTS,
  MAX_BOOSTERS,
  MAX_MUTATED_ATTRIBUTES,
  MUTATED_FITTING_SHARE_VERSION,
  quantiseRoll,
  type FittingShareInput,
} from './fittingShare';

const emptyModules = { high: [], mid: [], low: [], rig: [], subsystem: [] };

/** Deflates+base64url's an arbitrary raw body, bypassing `encodeFittingShare`'s
 * own validation — for tests that need to hand-craft a forged decompressed
 * payload rather than encode a real `FittingShareInput`. */
async function packRawBody(
  body: string,
  version: string = LEGACY_FITTING_SHARE_VERSION
): Promise<string> {
  const bytes = new TextEncoder().encode(body);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  }).pipeThrough(
    new CompressionStream('deflate-raw') as ReadableWritablePair<Uint8Array, Uint8Array>
  );
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  const compressed = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    compressed.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let binary = '';
  for (const b of compressed) binary += String.fromCharCode(b);
  const b64url = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${version}.${b64url}`;
}

function minimalInput(): FittingShareInput {
  return {
    hullTypeId: 24698, // Vexor
    modules: emptyModules,
    drones: [],
    fighters: [],
    cargo: [],
  };
}

function cruiserInput(): FittingShareInput {
  return {
    hullTypeId: 24698,
    modules: {
      high: [
        { slotIndex: 0, typeId: 2929, state: 'active', chargeTypeId: 12608 },
        { slotIndex: 1, typeId: 2929, state: 'active', chargeTypeId: 12608 },
        { slotIndex: 2, typeId: 2929, state: 'active', chargeTypeId: 12608 },
        { slotIndex: 4, typeId: 21486, state: 'online' },
      ],
      mid: [
        { slotIndex: 0, typeId: 2281, state: 'online' },
        { slotIndex: 1, typeId: 5945, state: 'online' },
        { slotIndex: 2, typeId: 1978, state: 'offline' },
      ],
      low: [
        { slotIndex: 0, typeId: 519, state: 'online' },
        { slotIndex: 1, typeId: 519, state: 'online' },
        { slotIndex: 2, typeId: 22291, state: 'online' },
      ],
      rig: [{ slotIndex: 0, typeId: 31120, state: 'online' }],
      subsystem: [],
    },
    drones: [
      { typeId: 2454, count: 5, active: 5 },
      { typeId: 2446, count: 5, active: 0 },
    ],
    fighters: [],
    cargo: [
      { typeId: 12608, quantity: 400 },
      { typeId: 28668, quantity: 1 },
    ],
    implantSet: { implants: [13236, 13232], boosters: [10228] },
  };
}

describe('encodeFittingShare / decodeFittingShare round trip', () => {
  it('round-trips a minimal fitting (hull only)', async () => {
    const input = minimalInput();
    const encoded = await encodeFittingShare(input);
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    const decoded = await decodeFittingShare(encoded.payload);
    expect(decoded).toEqual({ ok: true, value: input });
  });

  it('round-trips a full cruiser fitting: modules with state and charge, drones with active counts, cargo, implant/booster set', async () => {
    const input = cruiserInput();
    const encoded = await encodeFittingShare(input);
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    const decoded = await decodeFittingShare(encoded.payload);
    expect(decoded).toEqual({ ok: true, value: input });
  });

  it('preserves slot position across a gap (no shifting of later modules into an earlier empty slot)', async () => {
    const input = minimalInput();
    input.modules = {
      ...emptyModules,
      high: [{ slotIndex: 4, typeId: 2929, state: 'active' }],
    };
    const encoded = await encodeFittingShare(input);
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    const decoded = await decodeFittingShare(encoded.payload);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.value.modules.high).toEqual([{ slotIndex: 4, typeId: 2929, state: 'active' }]);
  });

  it('round-trips every module state', async () => {
    const input = minimalInput();
    input.modules = {
      ...emptyModules,
      high: [
        { slotIndex: 0, typeId: 1, state: 'offline' },
        { slotIndex: 1, typeId: 2, state: 'online' },
        { slotIndex: 2, typeId: 3, state: 'active' },
        { slotIndex: 3, typeId: 4, state: 'overload' },
      ],
    };
    const encoded = await encodeFittingShare(input);
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    const decoded = await decodeFittingShare(encoded.payload);
    expect(decoded).toEqual({ ok: true, value: input });
  });

  it('an unknown/made-up type ID survives the round trip unchanged (engine layer never validates against a catalog)', async () => {
    const input = minimalInput();
    input.hullTypeId = 999999999;
    input.modules = {
      ...emptyModules,
      high: [{ slotIndex: 0, typeId: 888888888, state: 'online' }],
    };
    const encoded = await encodeFittingShare(input);
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    const decoded = await decodeFittingShare(encoded.payload);
    expect(decoded).toEqual({ ok: true, value: input });
  });

  it('round-trips an explicit empty implant set distinctly from no implant set at all', async () => {
    const input = minimalInput();
    input.implantSet = { implants: [], boosters: [] };
    const encoded = await encodeFittingShare(input);
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    const decoded = await decodeFittingShare(encoded.payload);
    expect(decoded).toEqual({ ok: true, value: input });
    if (decoded.ok) {
      expect(decoded.value.implantSet).toEqual({ implants: [], boosters: [] });
    }
  });

  it('encodes a typical cruiser fitting to a compact URL-safe string', async () => {
    const encoded = await encodeFittingShare(cruiserInput());
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    expect(encoded.payload).toMatch(/^[A-Za-z0-9_.-]+$/);
    expect(encoded.payload.length).toBeLessThan(400);
  });

  it('carries the version prefix', async () => {
    const encoded = await encodeFittingShare(minimalInput());
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    expect(encoded.payload.startsWith(`${FITTING_SHARE_VERSION}.`)).toBe(true);
  });
});

describe('encodeFittingShare ceilings', () => {
  it('rejects more modules in one category than MAX_SLOTS_PER_CATEGORY', async () => {
    const input = minimalInput();
    input.modules = {
      ...emptyModules,
      high: Array.from({ length: MAX_SLOTS_PER_CATEGORY + 1 }, (_, i) => ({
        slotIndex: i,
        typeId: 1,
        state: 'online' as const,
      })),
    };
    const encoded = await encodeFittingShare(input);
    expect(encoded).toEqual({ ok: false, reason: 'too-large' });
  });

  it('rejects more drone stacks than MAX_DRONE_STACKS', async () => {
    const input = minimalInput();
    input.drones = Array.from({ length: MAX_DRONE_STACKS + 1 }, () => ({
      typeId: 1,
      count: 1,
      active: 0,
    }));
    const encoded = await encodeFittingShare(input);
    expect(encoded).toEqual({ ok: false, reason: 'too-large' });
  });

  it('rejects more fighters than MAX_FIGHTERS', async () => {
    const input = minimalInput();
    input.fighters = Array.from({ length: MAX_FIGHTERS + 1 }, () => ({ typeId: 1, count: 1 }));
    const encoded = await encodeFittingShare(input);
    expect(encoded).toEqual({ ok: false, reason: 'too-large' });
  });

  it('rejects more cargo items than MAX_CARGO_ITEMS', async () => {
    const input = minimalInput();
    input.cargo = Array.from({ length: MAX_CARGO_ITEMS + 1 }, () => ({ typeId: 1, quantity: 1 }));
    const encoded = await encodeFittingShare(input);
    expect(encoded).toEqual({ ok: false, reason: 'too-large' });
  });

  it('rejects more implants than MAX_IMPLANTS', async () => {
    const input = minimalInput();
    input.implantSet = {
      implants: Array.from({ length: MAX_IMPLANTS + 1 }, (_, i) => i + 1),
      boosters: [],
    };
    const encoded = await encodeFittingShare(input);
    expect(encoded).toEqual({ ok: false, reason: 'too-large' });
  });

  it('rejects more boosters than MAX_BOOSTERS', async () => {
    const input = minimalInput();
    input.implantSet = {
      implants: [],
      boosters: Array.from({ length: MAX_BOOSTERS + 1 }, (_, i) => i + 1),
    };
    const encoded = await encodeFittingShare(input);
    expect(encoded).toEqual({ ok: false, reason: 'too-large' });
  });
});

describe('decodeFittingShare error handling', () => {
  it('never throws on garbage input', async () => {
    await expect(decodeFittingShare('not a real payload at all')).resolves.toBeDefined();
  });

  it('rejects a payload with no version separator', async () => {
    const decoded = await decodeFittingShare('garbage-with-no-dot');
    expect(decoded).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects an unknown version with a typed reason distinct from a corrupt payload', async () => {
    const encoded = await encodeFittingShare(minimalInput());
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    const body = encoded.payload.slice(encoded.payload.indexOf('.'));
    const decoded = await decodeFittingShare(`99${body}`);
    expect(decoded).toEqual({ ok: false, reason: 'unsupported-version' });
  });

  it('rejects a corrupt (non-decompressible) payload after a valid version prefix', async () => {
    const decoded = await decodeFittingShare(`${FITTING_SHARE_VERSION}.not-valid-deflate-data`);
    expect(decoded).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects an empty payload', async () => {
    const decoded = await decodeFittingShare('');
    expect(decoded).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects a forged payload that decompresses past the size cap rather than hanging or crashing', async () => {
    // A highly repetitive body compresses tiny but decompresses huge — the
    // classic "decompression bomb" shape. This should come back `invalid`,
    // never throw and never allocate the full decompressed size.
    const payload = await packRawBody('0'.repeat(2_000_000));
    const decoded = await decodeFittingShare(payload);
    expect(decoded).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects a base64url segment past MAX_ENCODED_LENGTH before ever attempting to inflate it', async () => {
    const decoded = await decodeFittingShare(`${FITTING_SHARE_VERSION}.${'A'.repeat(20001)}`);
    expect(decoded).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects a module tuple missing its state field', async () => {
    const body = ['1', '1:1;;;;', '', '', '', ''].join('|');
    const decoded = await decodeFittingShare(await packRawBody(body));
    expect(decoded).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects a module tuple with an out-of-range state token', async () => {
    const body = ['1', '0:1:9;;;;', '', '', '', ''].join('|');
    const decoded = await decodeFittingShare(await packRawBody(body));
    expect(decoded).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects a drone stack whose active count exceeds its total count', async () => {
    const body = ['1', ';;;;', '1:1:2', '', '', ''].join('|');
    const decoded = await decodeFittingShare(await packRawBody(body));
    expect(decoded).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects a numeric token long enough to overflow parseInt to Infinity', async () => {
    const body = ['1', ';;;;', '', '', `${'z'.repeat(300)}:1`, ''].join('|');
    const decoded = await decodeFittingShare(await packRawBody(body));
    expect(decoded).toEqual({ ok: false, reason: 'invalid' });
  });
});

describe('fit name (version 2, #1718)', () => {
  it('round-trips a fit name, including separators and non-ASCII characters', async () => {
    const name = 'PvP | Lokis, 100% "Ω" fit';
    const encoded = await encodeFittingShare({ ...minimalInput(), name });
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    expect(encoded.payload.startsWith('2.')).toBe(true);
    const decoded = await decodeFittingShare(encoded.payload);
    expect(decoded.ok && decoded.value.name).toBe(name);
  });

  it('decodes a nameless payload with no name', async () => {
    const encoded = await encodeFittingShare(minimalInput());
    if (!encoded.ok) throw new Error('encode failed');
    const decoded = await decodeFittingShare(encoded.payload);
    expect(decoded.ok && decoded.value.name).toBeUndefined();
  });

  it('truncates an over-long name on encode', async () => {
    const encoded = await encodeFittingShare({
      ...minimalInput(),
      name: 'x'.repeat(MAX_FIT_NAME_LENGTH + 50),
    });
    if (!encoded.ok) throw new Error('encode failed');
    const decoded = await decodeFittingShare(encoded.payload);
    expect(decoded.ok && decoded.value.name).toBe('x'.repeat(MAX_FIT_NAME_LENGTH));
  });

  it('rejects a forged over-long name', async () => {
    const body = ['1', ';;;;', '', '', '', '', 'x'.repeat(MAX_FIT_NAME_LENGTH + 1)].join('|');
    const decoded = await decodeFittingShare(await packRawBody(body, FITTING_SHARE_VERSION));
    expect(decoded).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects a malformed percent-escape in the name', async () => {
    const body = ['1', ';;;;', '', '', '', '', '%E0%A4%A'].join('|');
    const decoded = await decodeFittingShare(await packRawBody(body, FITTING_SHARE_VERSION));
    expect(decoded).toEqual({ ok: false, reason: 'invalid' });
  });

  it('still decodes a recorded version-1 payload, with no name', async () => {
    const body = ['1', ';;;;', '', '', '', ''].join('|');
    const decoded = await decodeFittingShare(await packRawBody(body, '1'));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.value.hullTypeId).toBe(1);
    expect(decoded.value.name).toBeUndefined();
  });

  it('rejects a version-2 payload missing the name part, and a version-1 payload with one', async () => {
    const six = ['1', ';;;;', '', '', '', ''].join('|');
    expect(await decodeFittingShare(await packRawBody(six, FITTING_SHARE_VERSION))).toEqual({
      ok: false,
      reason: 'invalid',
    });
    expect(await decodeFittingShare(await packRawBody(six + '|x', '1'))).toEqual({
      ok: false,
      reason: 'invalid',
    });
  });
});

describe('trailing sections: Tactical Destroyer mode and booster side effects', () => {
  it('round-trips a mode and the booster side effects switched on', async () => {
    const input: FittingShareInput = {
      ...minimalInput(),
      hullTypeId: 34562,
      implantSet: { implants: [], boosters: [9950] },
      mode: 34564,
      boosterSideEffects: [2737, 2749],
    };
    const encoded = await encodeFittingShare(input);
    if (!encoded.ok) throw new Error('encode failed');
    const decoded = await decodeFittingShare(encoded.payload);
    expect(decoded).toEqual({ ok: true, value: { ...input } });
  });

  it('round-trips a mode alone', async () => {
    const input: FittingShareInput = { ...minimalInput(), hullTypeId: 34562, mode: 34570 };
    const encoded = await encodeFittingShare(input);
    if (!encoded.ok) throw new Error('encode failed');
    const decoded = await decodeFittingShare(encoded.payload);
    expect(decoded.ok && decoded.value.mode).toBe(34570);
    expect(decoded.ok && 'boosterSideEffects' in decoded.value).toBe(false);
  });

  it('writes a fit with neither exactly as before, so older links and older builds agree', async () => {
    const decoded = await decodeFittingShare(
      await packRawBody(['1', ';;;;', '', '', '', ''].join('|'))
    );
    expect(decoded).toEqual({
      ok: true,
      value: { hullTypeId: 1, modules: emptyModules, drones: [], fighters: [], cargo: [] },
    });
    const encoded = await encodeFittingShare(minimalInput());
    const again = encoded.ok ? await decodeFittingShare(encoded.payload) : null;
    expect(again?.ok && Object.keys(again.value)).not.toContain('mode');
  });

  it('reads a mode, then side effects, after the name, and nothing longer', async () => {
    const withMode = await decodeFittingShare(
      await packRawBody(['1', ';;;;', '', '', '', '', '', 'qvw'].join('|'), FITTING_SHARE_VERSION)
    );
    expect(withMode.ok && withMode.value.mode).toBe(parseInt('qvw', 36));
    const withSideEffects = await decodeFittingShare(
      await packRawBody(
        ['1', ';;;;', '', '', '', '', '', '', '235,24l'].join('|'),
        FITTING_SHARE_VERSION
      )
    );
    expect(withSideEffects.ok && withSideEffects.value.boosterSideEffects).toEqual([
      parseInt('235', 36),
      parseInt('24l', 36),
    ]);
    expect(withSideEffects.ok && 'mode' in withSideEffects.value).toBe(false);
    const tooLong = await decodeFittingShare(
      await packRawBody(
        ['1', ';;;;', '', '', '', '', '', '', '', ''].join('|'),
        FITTING_SHARE_VERSION
      )
    );
    expect(tooLong).toEqual({ ok: false, reason: 'invalid' });
  });

  it('keeps version 1 at exactly six sections', async () => {
    const decoded = await decodeFittingShare(
      await packRawBody(['1', ';;;;', '', '', '', '', 'qvw'].join('|'))
    );
    expect(decoded).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects a malformed mode or side effect', async () => {
    for (const body of [
      ['1', ';;;;', '', '', '', '', '', 'x.y'],
      ['1', ';;;;', '', '', '', '', '', '', '1,,2'],
    ]) {
      const decoded = await decodeFittingShare(
        await packRawBody(body.join('|'), FITTING_SHARE_VERSION)
      );
      expect(decoded).toEqual({ ok: false, reason: 'invalid' });
    }
  });
});

describe('fighters: launched or in the bay', () => {
  it('marks only a bay squadron, so a launched one is written as it always was', async () => {
    const input: FittingShareInput = {
      ...minimalInput(),
      fighters: [
        { typeId: 23055, count: 6 },
        { typeId: 23055, count: 6, inBay: true },
      ],
    };
    const encoded = await encodeFittingShare(input);
    if (!encoded.ok) throw new Error('encode failed');
    expect(await decodeFittingShare(encoded.payload)).toEqual({ ok: true, value: { ...input } });
    const bare = await decodeFittingShare(
      await packRawBody(['1', ';;;;', '', 'hsv:6', '', ''].join('|'))
    );
    expect(bare.ok && bare.value.fighters).toEqual([{ typeId: parseInt('hsv', 36), count: 6 }]);
  });

  it('rejects a bay flag other than 0', async () => {
    const decoded = await decodeFittingShare(
      await packRawBody(['1', ';;;;', '', 'hsv:6:1', '', ''].join('|'))
    );
    expect(decoded).toEqual({ ok: false, reason: 'invalid' });
  });
});

describe('mutated items (version 3)', () => {
  // Heavy Abyssal Energy Neutralizer from a Heavy Gremlin Compact, Gravid
  // mutaplasmid — the live ESI sample's rolls.
  const NEUT_MUTATION = {
    baseTypeId: 16475,
    mutaplasmidTypeId: 47831,
    attributes: { 6: 419.25, 54: 15680, 97: 591.36 },
  };

  function mutatedInput(): FittingShareInput {
    return {
      ...minimalInput(),
      modules: {
        ...emptyModules,
        high: [
          { slotIndex: 0, typeId: 3186, state: 'active', chargeTypeId: 230 },
          { slotIndex: 1, typeId: 47832, state: 'active', mutation: NEUT_MUTATION },
        ],
        // Base and mutaplasmid known, rolls not: an empty attribute set.
        low: [
          {
            slotIndex: 0,
            typeId: 47820,
            state: 'online',
            mutation: { baseTypeId: 2048, mutaplasmidTypeId: 47816, attributes: {} },
          },
        ],
      },
      drones: [
        { typeId: 2454, count: 4, active: 4 },
        {
          typeId: 60478,
          count: 1,
          active: 1,
          mutation: { baseTypeId: 2454, mutaplasmidTypeId: 60461, attributes: { 64: 1.9123 } },
        },
      ],
      name: 'Abyssal neut',
    };
  }

  it('round-trips mutated modules and drones as version 3', async () => {
    const input = mutatedInput();
    const encoded = await encodeFittingShare(input);
    if (!encoded.ok) throw new Error('encode failed');
    expect(encoded.payload.startsWith(`${MUTATED_FITTING_SHARE_VERSION}.`)).toBe(true);
    expect(await decodeFittingShare(encoded.payload)).toEqual({ ok: true, value: input });
  });

  it('round-trips beside a mode and side effects', async () => {
    const input: FittingShareInput = {
      ...mutatedInput(),
      hullTypeId: 34562,
      implantSet: { implants: [], boosters: [9950] },
      mode: 34564,
      boosterSideEffects: [2737],
    };
    const encoded = await encodeFittingShare(input);
    if (!encoded.ok) throw new Error('encode failed');
    expect(await decodeFittingShare(encoded.payload)).toEqual({ ok: true, value: input });
  });

  it('keeps writing version 2 for a fit with nothing mutated, so older builds still open it', async () => {
    const encoded = await encodeFittingShare(cruiserInput());
    expect(encoded.ok && encoded.payload.startsWith(`${FITTING_SHARE_VERSION}.`)).toBe(true);
  });

  it('still decodes a version-2 code saved before version 3 existed', async () => {
    // Encoded by the pre-v3 encoder (2026-10-16) — a My Fittings record or an old link.
    const saved =
      '2.SynKqzGwMkrPtDKyMku1NrAyLEqxMgTR2eVWhtbWNYblZlamVqY1NWapVkXFNTXBiWWpKapGBkmpaflFqapGBmXGAA';
    expect(await decodeFittingShare(saved)).toEqual({
      ok: true,
      value: {
        hullTypeId: 17843,
        modules: {
          high: [{ slotIndex: 0, typeId: 3186, state: 'active', chargeTypeId: 230 }],
          mid: [{ slotIndex: 0, typeId: 2281, state: 'online', chargeTypeId: undefined }],
          low: [{ slotIndex: 0, typeId: 2048, state: 'online', chargeTypeId: undefined }],
          rig: [],
          subsystem: [],
        },
        drones: [{ typeId: 2454, count: 5, active: 5 }],
        fighters: [],
        cargo: [{ typeId: 230, quantity: 1000 }],
        implantSet: undefined,
        name: 'Saved before v3',
      },
    });
  });

  it('re-encodes that pre-version-3 code byte for byte', async () => {
    const saved =
      '2.SynKqzGwMkrPtDKyMku1NrAyLEqxMgTR2eVWhtbWNYblZlamVqY1NWapVkXFNTXBiWWpKapGBkmpaflFqapGBmXGAA';
    const decoded = await decodeFittingShare(saved);
    if (!decoded.ok) throw new Error('decode failed');
    expect(await encodeFittingShare(decoded.value)).toEqual({ ok: true, payload: saved });
  });

  it('quantises a roll to 6 significant digits — finer than the game shows any attribute', () => {
    expect(quantiseRoll(419.25)).toBe(419.25);
    expect(quantiseRoll(15680)).toBe(15680);
    expect(quantiseRoll(591.3600000476837)).toBe(591.36);
    // A resonance: 62.3457% shown to two decimals in game.
    expect(quantiseRoll(0.37654321987)).toBe(0.376543);
    expect(quantiseRoll(123456.789)).toBe(123457);
    expect(quantiseRoll(-0.000123456789)).toBe(-0.000123457);
  });

  it('carries every roll within that precision through a round trip', async () => {
    const rolls = { 6: 419.2500004768, 54: 15679.99999, 97: 591.3612345, 974: 0.6234567891 };
    const input: FittingShareInput = {
      ...minimalInput(),
      modules: {
        ...emptyModules,
        high: [
          {
            slotIndex: 0,
            typeId: 47832,
            state: 'active',
            mutation: { baseTypeId: 16475, mutaplasmidTypeId: 47831, attributes: rolls },
          },
        ],
      },
    };
    const encoded = await encodeFittingShare(input);
    if (!encoded.ok) throw new Error('encode failed');
    const decoded = await decodeFittingShare(encoded.payload);
    if (!decoded.ok) throw new Error('decode failed');
    const back = decoded.value.modules.high[0]!.mutation!.attributes;
    for (const [id, value] of Object.entries(rolls)) {
      expect(Math.abs(back[Number(id)]! - value) / Math.abs(value)).toBeLessThan(5e-6);
    }
  });

  it('stays a short link with 8 mutated modules', async () => {
    // Eight modules, each with five rolls at full float precision — the
    // worst case of the wire's per-roll cost.
    const high = Array.from({ length: 8 }, (_, i) => ({
      slotIndex: i,
      typeId: 47832,
      state: 'active' as const,
      mutation: {
        baseTypeId: 16475,
        mutaplasmidTypeId: 47831,
        attributes: {
          6: 400 + i * 13.37171,
          30: 1700 + i * 7.1234567,
          50: 30 + i * 0.7654321,
          54: 15000 + i * 123.456789,
          97: 560 + i * 3.14159265,
        },
      },
    }));
    const encoded = await encodeFittingShare({
      ...cruiserInput(),
      modules: { ...cruiserInput().modules, high },
    });
    if (!encoded.ok) throw new Error('encode failed');
    // 8 modules x 5 rolls: 418 characters measured on 2026-10-16, against
    // 142 for the same fit unmutated. Bounded well below any URL limit.
    expect(encoded.payload.length).toBeLessThan(600);
  });

  it('rejects a mutation pointing at no item, twice at one item, or at a drone stack', async () => {
    for (const mutations of ['h0:1:2:', 'd0:1:2:', 'h0:1:2:,h0:1:2:', 'x0:1:2:']) {
      const decoded = await decodeFittingShare(
        await packRawBody(
          ['1', ';;;;', '', '', '', '', '', '', '', mutations].join('|'),
          MUTATED_FITTING_SHARE_VERSION
        )
      );
      expect(decoded).toEqual({ ok: false, reason: 'invalid' });
    }
    // `d00` is `d0` written longer: still the same drone.
    const twice = await decodeFittingShare(
      await packRawBody(
        ['1', ';;;;', '1:1:0', '', '', '', '', '', '', 'd0:1:2:,d00:1:2:'].join('|'),
        MUTATED_FITTING_SHARE_VERSION
      )
    );
    expect(twice).toEqual({ ok: false, reason: 'invalid' });
    const stack = await decodeFittingShare(
      await packRawBody(
        ['1', ';;;;', '1:2:0', '', '', '', '', '', '', 'd0:1:2:'].join('|'),
        MUTATED_FITTING_SHARE_VERSION
      )
    );
    expect(stack).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects a malformed roll and too many of them', async () => {
    const tooMany = Array.from({ length: MAX_MUTATED_ATTRIBUTES + 1 }, (_, i) => `${i + 1}=1`).join(
      ';'
    );
    for (const attrs of ['6=', '6=abc', '6=1;6=2', '0=1', '6=Infinity', '6=1e999', tooMany]) {
      const decoded = await decodeFittingShare(
        await packRawBody(
          ['1', '0:2:1;;;;', '', '', '', '', '', '', '', `h0:1:2:${attrs}`].join('|'),
          MUTATED_FITTING_SHARE_VERSION
        )
      );
      expect(decoded).toEqual({ ok: false, reason: 'invalid' });
    }
  });

  it('reads a well-formed hand-built version-3 body', async () => {
    const decoded = await decodeFittingShare(
      await packRawBody(
        ['1', '0:2:1;;;;', '3:1:0', '', '', '', '', '', '', 'h0:4:5:6=1.5;a=-2e-7,d0:7:8:'].join(
          '|'
        ),
        MUTATED_FITTING_SHARE_VERSION
      )
    );
    expect(decoded.ok && decoded.value.modules.high[0]?.mutation).toEqual({
      baseTypeId: 4,
      mutaplasmidTypeId: 5,
      attributes: { 6: 1.5, 10: -2e-7 },
    });
    expect(decoded.ok && decoded.value.drones[0]?.mutation).toEqual({
      baseTypeId: 7,
      mutaplasmidTypeId: 8,
      attributes: {},
    });
  });

  it('never writes a mutation into a version-2 body, nor reads one from it', async () => {
    const decoded = await decodeFittingShare(
      await packRawBody(
        ['1', '0:2:1;;;;', '', '', '', '', '', '', '', 'h0:4:5:'].join('|'),
        FITTING_SHARE_VERSION
      )
    );
    expect(decoded).toEqual({ ok: false, reason: 'invalid' });
  });
});
