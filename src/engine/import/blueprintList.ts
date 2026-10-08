/**
 * Reads a pasted list of blueprints (the in-game assets or inventory window)
 * for the app-wide paste router, which turns it into a Build Group
 * (`pasteDestination.ts`, `features/industry/blueprintPaste.ts`).
 *
 * Pure text work over a caller-supplied set of every blueprint-like name
 * (lower-case, so unsupported invention/research blueprints count as
 * blueprints too). Lines are read by `parseAppraisalPaste`, so quantity and
 * column handling is the one every other item-list paste uses.
 */
import { parseAppraisalPaste } from '@/engine/market/appraisalPaste';

/** A trailing copy/original marker the client may append to a blueprint's name. */
const COPY_MARKER = /\s*(?:\((?:copy|original)\)|copy)$/i;

/** `Rifter Blueprint (Copy)` -> `rifter blueprint`. */
function blueprintKey(name: string): string {
  const lower = name.trim().toLowerCase();
  const stripped = lower.replace(COPY_MARKER, '').trim();
  return stripped === '' ? lower : stripped;
}

/**
 * The blueprint names in a paste, lower-cased and de-duplicated in first-seen
 * order. Copies and originals of one blueprint, and repeated lines, are one
 * name; lines that are not blueprints are ignored.
 */
export function parseBlueprintList(text: string, blueprintNames: ReadonlySet<string>): string[] {
  const seen = new Set<string>();
  for (const entry of parseAppraisalPaste(text)) {
    const exact = entry.name.trim().toLowerCase();
    const key = blueprintNames.has(exact) ? exact : blueprintKey(entry.name);
    if (blueprintNames.has(key)) seen.add(key);
  }
  return [...seen];
}

/**
 * True when most lines are blueprints — a strict majority, the same bar the
 * item list uses, so a mixed list still goes to the Appraisal.
 */
export function looksLikeBlueprintList(text: string, blueprintNames: ReadonlySet<string>): boolean {
  if (blueprintNames.size === 0) return false;
  let blueprints = 0;
  let others = 0;
  for (const entry of parseAppraisalPaste(text)) {
    const exact = entry.name.trim().toLowerCase();
    if (blueprintNames.has(exact) || blueprintNames.has(blueprintKey(entry.name))) blueprints++;
    else others++;
  }
  return blueprints > others;
}
