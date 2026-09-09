/**
 * Parse pasted EFT fit text into its raw structure (hull, fit name, item
 * lines). Pure text-structure parse only — no typeID/skill resolution here,
 * that's `fitToSkills.ts`'s job once the caller has a name→typeID lookup.
 *
 * Format spec verified against developers.eveonline.com/docs/guides/fitting/
 * (2026-08):
 * - Line 1: "[Ship Name, Fit Name]" — the fit name is optional, so a bare
 *   "[Ship Name]" (or one left empty, "[Ship Name, ]") still names a hull.
 * - Body: low/med/high slot modules, rigs, subsystems, services, drones,
 *   cargo — sections separated by one blank line (two between drones and
 *   cargo, which we treat the same as one: blank lines are pure separators,
 *   we don't need to know which section a line belongs to).
 * - A module line may carry a loaded charge: "Module Name, Charge Name" —
 *   emitted as two items (both matter for skill requirements, e.g. T2 ammo).
 * - Drone bay / cargo lines may carry a count suffix: "Item Name xN".
 * - Empty slots render as "[Empty <slot> slot]" — skipped entirely.
 * - Offline modules carry a "/offline" suffix — stripped; in-game import
 *   ignores it too, so we don't track offline state.
 */

export interface EftParseError {
  /** 1-indexed source line number. */
  line: number;
  /** Original line text, trimmed. */
  text: string;
  reason: string;
}

export interface EftItem {
  name: string;
  quantity: number;
  /**
   * Set only on the charge half of a "Module Name, Charge Name" line — the
   * ammo a module was left loaded with, never a module or a cargo line.
   *
   * Additive, and deliberately does not change how many items a fit produces:
   * `fitToSkills` and `clipboardImport` both read `name` alone, and the latter
   * counts *lines* to build its "Unknown item xN" warning, so any change to
   * this parser's cardinality would silently alter a shipped warning. A flag
   * on an unchanged item list cannot.
   *
   * Fit Import (issue #626) needs it because EFT gives a loaded charge its
   * module line's quantity: eight launchers yields "8", which counts launchers
   * rather than missiles and is a production quantity under no reading at all.
   */
  isCharge?: true;
}

export interface EftFit {
  shipName: string;
  fitName: string;
  items: EftItem[];
  errors: EftParseError[];
}

// The ", Fit Name" clause is optional: EVE and third-party tools both emit a
// bare "[Ship]" for an unnamed fit, and losing the hull over a missing
// nickname costs the pilot the one name they always care about (issue #630).
// The ship group excludes commas so "[Rifter, Kite, cheap]" still splits at
// the first one, and excludes a leading space so "[ , Max Hacker]" is a
// header error rather than the whitespace hull the old regex read it as. The
// fit group stays permissive
// (`.*?`) so a bracketed fit name like "[Rifter, [PVP]]" survives.
const HEADER = /^\[\s*([^\s,\]][^,\]]*?)\s*(?:,\s*(.*?)\s*)?\]$/;
const EMPTY_SLOT = /^\[Empty\s+.+\s+slot\]$/i;
const OFFLINE_SUFFIX = /\s*\/offline\s*$/i;
const QUANTITY_SUFFIX = /^(.*\S)\s+x(\d+)$/i;

/** Parse pasted EFT fit text. Never throws — malformed input surfaces as `errors`. */
export function parseEftFit(text: string): EftFit {
  const lines = text.split(/\r\n|\r|\n/);
  const errors: EftParseError[] = [];
  const items: EftItem[] = [];

  let shipName = '';
  let fitName = '';

  const headerIndex = lines.findIndex((l) => l.trim() !== '');
  const headerLine = headerIndex === -1 ? '' : lines[headerIndex].trim();
  // A fit body pasted without its header line starts on an empty slot, which
  // — now that a bare "[Ship]" is a legal header — would otherwise be read as
  // a hull named "Empty high slot".
  const headerMatch = EMPTY_SLOT.test(headerLine) ? null : HEADER.exec(headerLine);
  if (headerMatch) {
    shipName = headerMatch[1];
    // Absent on a bare "[Ship]", empty on "[Ship, ]" — the same to callers.
    fitName = headerMatch[2] ?? '';
  } else {
    errors.push({
      line: headerIndex === -1 ? 1 : headerIndex + 1,
      text: headerLine,
      reason: 'invalid or missing fit header, expected "[Ship Name]" or "[Ship Name, Fit Name]"',
    });
  }

  const bodyStart = headerIndex === -1 ? lines.length : headerIndex + 1;
  for (let i = bodyStart; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === '' || EMPTY_SLOT.test(trimmed)) continue;

    const withoutOffline = trimmed.replace(OFFLINE_SUFFIX, '').trim();
    const qtyMatch = QUANTITY_SUFFIX.exec(withoutOffline);
    const quantity = qtyMatch ? Number(qtyMatch[2]) : 1;
    const body = qtyMatch ? qtyMatch[1] : withoutOffline;

    const [modulePart, chargePart] = body.split(',').map((s) => s.trim());
    if (!modulePart) {
      errors.push({ line: i + 1, text: trimmed, reason: 'unparseable item line' });
      continue;
    }
    items.push({ name: modulePart, quantity });
    if (chargePart) items.push({ name: chargePart, quantity, isCharge: true });
  }

  return { shipName, fitName, items, errors };
}
