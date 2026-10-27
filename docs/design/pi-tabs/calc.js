// Shared PI math for the mockups. Mirrors src/engine/pi/chain.ts conventions.
(function () {
  const BY = window.PI_BY_ID;
  const TAX_BASE = { 0: 5, 1: 400, 2: 7200, 3: 60000, 4: 1200000 };
  const IMPORT_FRACTION = 0.5;
  const FACILITY = { 1: 'Basic Industry', 2: 'Advanced Industry', 3: 'Advanced Industry', 4: 'High-Tech Plant' };
  const PIN = { // cpu tf, pg MW
    ecu: { cpu: 400, pg: 2600 }, head: { cpu: 110, pg: 550 }, basic: { cpu: 200, pg: 800 },
    advanced: { cpu: 500, pg: 700 }, hightech: { cpu: 1100, pg: 400 }, launchpad: { cpu: 3600, pg: 700 }, storage: { cpu: 500, pg: 700 },
  };
  const CC = [{ cpu: 1675, pg: 6000 }, { cpu: 7057, pg: 9000 }, { cpu: 12136, pg: 12000 }, { cpu: 17215, pg: 15000 }, { cpu: 21315, pg: 17000 }, { cpu: 25415, pg: 19000 }];

  const perHour = (it) => it.qty * 3600 / it.cycle; // output units per hour per facility
  const price = (it) => it.sell ?? 0;

  // Planet types that can yield a P0
  function p0Planets(id) { return BY[id].planets; }
  // Which P0s a set of planet types can extract
  function availableP0(types) { return window.PI_ITEMS.filter(i => i.tier === 0 && i.planets.some(p => types.includes(p))).map(i => i.id); }

  // All P0 ids under an item
  function rawLeaves(id, acc = new Set()) { const it = BY[id]; if (!it.inputs) { acc.add(id); return acc; } it.inputs.forEach(x => rawLeaves(x.id, acc)); return acc; }

  // Can this item be fully made from these planet types? Returns {ok, missingP0[], needsHighTech}
  function reachable(id, types) {
    const have = new Set(availableP0(types));
    const missing = [...rawLeaves(id)].filter(p => !have.has(p));
    const it = BY[id];
    const htOk = it.tier < 4 || types.some(t => t === 'barren' || t === 'temperate');
    return { ok: missing.length === 0 && htOk, missingP0: missing, htOk };
  }

  // Expand demand for `rate` units/hour of `id`, down to `floor` tier (items at floor are bought).
  // Returns map id -> {id, tier, perHour, facilities, role:'make'|'buy'|'extract'}
  function expand(id, rate, floor = 0, out = new Map()) {
    const it = BY[id];
    const row = out.get(id) || { id, tier: it.tier, perHour: 0, facilities: 0, role: 'make' };
    row.perHour += rate;
    out.set(id, row);
    if (it.tier === 0) { row.role = 'extract'; return out; }
    if (it.tier <= floor) { row.role = 'buy'; return out; }
    row.facilities = row.perHour / perHour(it);
    const cycles = rate / it.qty; // per hour
    it.inputs.forEach(x => expand(x.id, cycles * x.q, floor, out));
    return out;
  }

  // Cost/profit per day for making `rate`/h of `id` with given floor and customs rate (0..1).
  // Assumes per-tier hops cross a planet boundary (planet-per-tier) — matches the pessimistic layout.
  function economics(id, rate, floor = 0, taxRate = 0.1) {
    const rows = expand(id, rate, floor);
    const it = BY[id];
    let buy = 0, tax = 0;
    for (const r of rows.values()) {
      if (r.id === +id) continue;
      if (r.role === 'buy') { buy += r.perHour * price(BY[r.id]); tax += r.perHour * TAX_BASE[r.tier] * IMPORT_FRACTION * taxRate; }
      else if (r.tier >= 1) { tax += r.perHour * TAX_BASE[r.tier] * (1 + IMPORT_FRACTION) * taxRate; } // export + import between planets
    }
    tax += rate * TAX_BASE[it.tier] * taxRate; // final export
    const revenue = rate * price(it);
    const h = { revenue, buy, tax, profit: revenue - buy - tax };
    const day = Object.fromEntries(Object.entries(h).map(([k, v]) => [k, v * 24]));
    return { perHour: h, perDay: day, rows: [...rows.values()].sort((a, b) => b.tier - a.tier) };
  }

  // P0 units per hour needed per 1 unit/hour of output (full chain from P0)
  function p0PerUnit(id) { let s = 0; for (const r of expand(id, 1, 0).values()) if (r.tier === 0) s += r.perHour; return s; }

  // Products that consume this item directly
  function usedBy(id) { return window.PI_ITEMS.filter(i => i.inputs && i.inputs.some(x => x.id === +id)); }

  // Value-add per facility-hour at this tier when inputs bought at hub
  function valueAddPerFacilityHour(id) {
    const it = BY[id]; if (!it.inputs) return 0;
    const cycles = 3600 / it.cycle;
    const inCost = it.inputs.reduce((s, x) => s + x.q * price(BY[x.id]), 0);
    return cycles * (it.qty * price(it) - inCost);
  }

  const isk = (v, d = 1) => { const a = Math.abs(v), s = v < 0 ? '−' : ''; if (a >= 1e9) return s + (a / 1e9).toFixed(d) + 'B'; if (a >= 1e6) return s + (a / 1e6).toFixed(d) + 'M'; if (a >= 1e3) return s + (a / 1e3).toFixed(d) + 'k'; return s + a.toFixed(0); };
  const signed = (v, d) => (v >= 0 ? '+' : '') + isk(v, d);

  window.PI = { TAX_BASE, FACILITY, PIN, CC, perHour, price, p0Planets, availableP0, rawLeaves, reachable, expand, economics, p0PerUnit, usedBy, valueAddPerFacilityHour, isk, signed };

  // A sample pilot's real-looking colonies (as ESI would give us): 6 planets, CC level 4, ~highsec POCO
  window.SAMPLE_COLONIES = [
    { name: 'Hek VI', type: 'barren', cc: 4, doing: 'Extracting Base Metals → Reactive Metals' },
    { name: 'Hek VIII', type: 'temperate', cc: 4, doing: 'Extracting Autotrophs → Industrial Fibers' },
    { name: 'Uttindar II', type: 'lava', cc: 4, doing: 'Extracting Felsic Magma → Silicon' },
    { name: 'Uttindar V', type: 'gas', cc: 4, doing: 'Extracting Reactive Gas → Oxidizing Compound' },
    { name: 'Uttindar VII', type: 'storm', cc: 4, doing: 'Extracting Ionic Solutions → Electrolytes' },
    { name: 'Lustrevik III', type: 'oceanic', cc: 4, doing: 'Extracting Complex Organisms → Proteins' },
  ];
})();
