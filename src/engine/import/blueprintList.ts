import { parseAppraisalPaste } from '@/engine/market/appraisalPaste';

const COPY_MARKER = /\s*(?:\((?:copy|original)\)|copy)$/i;

function blueprintKey(name: string): string {
  const lower = name.trim().toLowerCase();
  const stripped = lower.replace(COPY_MARKER, '').trim();
  return stripped === '' ? lower : stripped;
}

export function parseBlueprintList(text: string, blueprintNames: ReadonlySet<string>): string[] {
  const seen = new Set<string>();
  for (const entry of parseAppraisalPaste(text)) {
    const exact = entry.name.trim().toLowerCase();
    const key = blueprintNames.has(exact) ? exact : blueprintKey(entry.name);
    if (blueprintNames.has(key)) seen.add(key);
  }
  return [...seen];
}

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
