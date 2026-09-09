import { describe, expect, it } from 'vitest';
import { parseEftFit } from './eftFit';
import { fitToBuildPlans, type FitBlueprintLookup } from './fitToBuildPlans';

/**
 * The pinned fixture from the Build Groups spec (issue #626). A real Buzzard
 * fit, chosen because it exercises every quantity form at once: repeated
 * module lines, a bare single line, and an `xN` cargo suffix — plus three
 * items with no blueprint at all, which is the routine case rather than the
 * edge one.
 */
const BUZZARD_FIT = `[Buzzard, Loru's Max Hacker]
Inertial Stabilizers II
Inertial Stabilizers II
Micro Auxiliary Power Core I

5MN Cold-Gas Enduring Microwarpdrive
Data Analyzer II
Relic Analyzer II
Scan Rangefinding Array II
Cargo Scanner II

Sisters Core Probe Launcher
Interdiction Nullifier II
Covert Ops Cloaking Device II

Small Low Friction Nozzle Joints II
Small Low Friction Nozzle Joints II


Sisters Core Scanner Probe x16`;

/**
 * Faction ("Sisters ...") and named/meta ("... Enduring ...") modules drop from
 * NPCs and have no blueprint, so the lookup returns null for them exactly as
 * the real catalog does. Everything else resolves, one unit per run unless
 * stated — `unitsPerRun` is what forces the runs/spare arithmetic.
 */
const BUILDABLE: Record<string, { blueprintTypeID: number; unitsPerRun: number }> = {
  buzzard: { blueprintTypeID: 11194, unitsPerRun: 1 },
  'inertial stabilizers ii': { blueprintTypeID: 1406, unitsPerRun: 1 },
  'micro auxiliary power core i': { blueprintTypeID: 11566, unitsPerRun: 1 },
  'data analyzer ii': { blueprintTypeID: 30832, unitsPerRun: 1 },
  'relic analyzer ii': { blueprintTypeID: 30838, unitsPerRun: 1 },
  'scan rangefinding array ii': { blueprintTypeID: 4436, unitsPerRun: 1 },
  'cargo scanner ii': { blueprintTypeID: 30334, unitsPerRun: 1 },
  'interdiction nullifier ii': { blueprintTypeID: 60506, unitsPerRun: 1 },
  'covert ops cloaking device ii': { blueprintTypeID: 11576, unitsPerRun: 1 },
  'small low friction nozzle joints ii': { blueprintTypeID: 31056, unitsPerRun: 1 },
};

const lookup: FitBlueprintLookup = (name) => {
  const hit = BUILDABLE[name.toLowerCase()];
  if (!hit) return null;
  return {
    blueprintTypeID: hit.blueprintTypeID,
    productTypeID: hit.blueprintTypeID + 1_000_000,
    productName: name,
    unitsPerRun: hit.unitsPerRun,
  };
};

function runFixture() {
  return fitToBuildPlans(parseEftFit(BUZZARD_FIT), lookup);
}

describe('fitToBuildPlans — Buzzard fixture', () => {
  it('yields the hull plus 12 distinct items (13 rows in all)', () => {
    const result = runFixture();
    expect(result.hull?.productName).toBe('Buzzard');
    // 12 distinct non-hull entries: 9 buildable items + 3 skipped.
    expect(result.items).toHaveLength(9);
    expect(result.skipped).toHaveLength(3);
    expect(result.items.length + result.skipped.length + 1).toBe(13);
  });

  it('sums a module named on two separate lines', () => {
    const result = runFixture();
    const stabs = result.items.find((i) => i.productName === 'Inertial Stabilizers II');
    expect(stabs?.quantity).toBe(2);
    // One unit per run, so runs tracks quantity and nothing is left over.
    expect(stabs?.runs).toBe(2);
    expect(stabs?.spare).toBe(0);

    const nozzles = result.items.find(
      (i) => i.productName === 'Small Low Friction Nozzle Joints II'
    );
    expect(nozzles?.quantity).toBe(2);
  });

  it('reads an xN cargo suffix as that quantity', () => {
    // Skipped, not built — but the quantity still has to survive, so the
    // pilot is told how many of it they were not given a plan for.
    const result = runFixture();
    const probes = result.skipped.find((s) => s.name === 'Sisters Core Scanner Probe');
    expect(probes?.quantity).toBe(16);
  });

  it('names every unbuildable item rather than dropping it', () => {
    const result = runFixture();
    expect(result.skipped.map((s) => s.name).sort()).toEqual([
      '5MN Cold-Gas Enduring Microwarpdrive',
      'Sisters Core Probe Launcher',
      'Sisters Core Scanner Probe',
    ]);
  });

  it('takes the group name from the fit header', () => {
    expect(runFixture().groupName).toBe("Loru's Max Hacker");
  });
});

describe('fitToBuildPlans — runs and spare', () => {
  const ammoLookup: FitBlueprintLookup = () => ({
    blueprintTypeID: 1,
    productTypeID: 2,
    productName: 'Scourge Fury Heavy Missile',
    unitsPerRun: 100,
  });

  it('converts a quantity into whole runs of the blueprint batch', () => {
    const fit = parseEftFit('[Drake, PvE]\n\nScourge Fury Heavy Missile x2000');
    const [row] = fitToBuildPlans(fit, ammoLookup).items;
    expect(row.quantity).toBe(2000);
    expect(row.runs).toBe(20);
    expect(row.spare).toBe(0);
  });

  it('rounds a partial batch up and reports the surplus as spare', () => {
    const fit = parseEftFit('[Drake, PvE]\n\nScourge Fury Heavy Missile x150');
    const [row] = fitToBuildPlans(fit, ammoLookup).items;
    expect(row.runs).toBe(2);
    // 2 runs x 100 = 200 made for 150 needed.
    expect(row.spare).toBe(50);
  });

  it('never emits fewer than one run', () => {
    const fit = parseEftFit('[Drake, PvE]\n\nScourge Fury Heavy Missile x1');
    expect(fitToBuildPlans(fit, ammoLookup).items[0].runs).toBe(1);
  });

  it('clamps runs to the 100k ceiling the plan itself computes at', () => {
    // A stored 2,000,000 would *display* as 2,000,000 while every number on
    // the page was computed at computeBuildPlan's own clamp — a silent lie.
    const fit = parseEftFit('[Drake, PvE]\n\nScourge Fury Heavy Missile x200000000');
    const [row] = fitToBuildPlans(fit, ammoLookup).items;
    expect(row.runs).toBe(100_000);
  });
});

describe('fitToBuildPlans — charges', () => {
  const fitText = '[Drake, PvE]\nHeavy Missile Launcher II, Scourge Fury Heavy Missile';
  const bothLookup: FitBlueprintLookup = (name) => ({
    blueprintTypeID: name.length,
    productTypeID: name.length + 1000,
    productName: name,
    unitsPerRun: 1,
  });

  it('excludes a module-line charge by default', () => {
    const result = fitToBuildPlans(parseEftFit(fitText), bothLookup);
    expect(result.items.map((i) => i.productName)).toEqual(['Heavy Missile Launcher II']);
    // Withheld deliberately, so it is reported rather than silently absent:
    // EFT gives a loaded charge its module line's quantity, which is a count
    // of launchers, not a production batch.
    expect(result.excludedCharges.map((c) => c.name)).toEqual(['Scourge Fury Heavy Missile']);
  });

  it('includes charges at one full batch when asked', () => {
    const result = fitToBuildPlans(parseEftFit(fitText), bothLookup, { includeCharges: true });
    const charge = result.items.find((i) => i.productName === 'Scourge Fury Heavy Missile');
    expect(charge?.runs).toBe(1);
    expect(result.excludedCharges).toEqual([]);
  });
});

describe('fitToBuildPlans — merging and degenerate headers', () => {
  it('merges two spellings that resolve to one blueprint', () => {
    const fit = parseEftFit('[Drake, PvE]\nWarrior II\nwarrior ii');
    const result = fitToBuildPlans(fit, (name) => ({
      blueprintTypeID: 999,
      productTypeID: 1999,
      productName: name,
      unitsPerRun: 1,
    }));
    expect(result.items).toHaveLength(1);
    expect(result.items[0].quantity).toBe(2);
  });

  it('reports an unreadable header as an error and imports no hull', () => {
    // shipName and fitName are written together or not at all, so a header
    // that fails to parse costs the hull too — surfaced, never silent.
    const result = fitToBuildPlans(parseEftFit('Inertial Stabilizers II'), lookup);
    expect(result.hull).toBeNull();
    expect(result.groupName).toBeNull();
    expect(result.headerFailed).toBe(true);
  });

  it('counts a skipped item named on several lines once, with the total', () => {
    const fit = parseEftFit(
      '[Buzzard, X]\nSisters Core Probe Launcher\nSisters Core Probe Launcher'
    );
    const result = fitToBuildPlans(fit, lookup);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].quantity).toBe(2);
  });
});
