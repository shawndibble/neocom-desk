/**
 * Orchestrates the "Import from clipboard" preview: auto-detects EFT fit vs.
 * skill-plan-paste text, resolves names, and (for EFT) prefetches the dogma
 * data fitToSkills needs. Kept out of the dialog component so the parsing
 * logic is unit-testable without rendering anything.
 */
import { parseEftFit } from '@/engine/import/eftFit';
import {
  fitToSkills,
  type RequiredSkill,
  type RequiredSkillsLookup,
} from '@/engine/import/fitToSkills';
import { parseSkillPlanPaste } from '@/engine/import/skillPlanPaste';
import { extractRequiredSkills } from '../dogma';
import type { PlanEntry } from '@/engine/types';
import type { UniverseType } from '@/esi/endpoints';
import type { TypeCatalogEntry } from '../typeCatalog';

export type ClipboardImportMode = 'skillPlan' | 'eftFit';

export interface ClipboardImportLineIssue {
  line: number;
  text: string;
  reason: string;
}

export interface ClipboardImportPreview {
  mode: ClipboardImportMode;
  shipName?: string;
  fitName?: string;
  entries: PlanEntry[];
  /** Unresolved item/skill names, and types whose requirements couldn't be fetched. */
  warnings: string[];
  /** Line-level parse errors (bad header, unrecognized line format). */
  errors: ClipboardImportLineIssue[];
}

export interface ClipboardImportDeps {
  /** Skill names only, for the skill-plan-paste path. */
  skillByName: ReadonlyMap<string, TypeCatalogEntry>;
  /** Ship/module/charge names, for the EFT-fit path. */
  typeByName: ReadonlyMap<string, TypeCatalogEntry>;
  /** ESI or cache; used to fetch each resolved item's dogma_attributes. */
  loadType: (typeId: number) => Promise<{ data: UniverseType } | null | undefined>;
}

function firstNonBlankLine(text: string): string {
  return (
    text
      .split(/\r\n|\r|\n/)
      .find((l) => l.trim() !== '')
      ?.trim() ?? ''
  );
}

/** EFT fits always start with "[Ship Name, Fit Name]" — same signal parseEftFit's own header check uses. */
export function detectMode(text: string): ClipboardImportMode {
  return firstNonBlankLine(text).startsWith('[') ? 'eftFit' : 'skillPlan';
}

async function previewEftFit(
  text: string,
  { typeByName, loadType }: ClipboardImportDeps
): Promise<ClipboardImportPreview> {
  const fit = parseEftFit(text);
  const errors = fit.errors.map((e) => ({ line: e.line, text: e.text, reason: e.reason }));

  // Resolve every referenced name up front so we know which typeIDs to
  // prefetch dogma for. fitToSkills does its own (equivalent) resolution
  // against the same typeByName and is the source of truth for "unknown
  // item" warnings, avoiding double-reporting.
  const names = fit.shipName
    ? [fit.shipName, ...fit.items.map((i) => i.name)]
    : fit.items.map((i) => i.name);
  const resolvedIds = new Set<number>();
  for (const name of names) {
    const type = typeByName.get(name.toLowerCase());
    if (type) resolvedIds.add(type.typeID);
  }

  const requiredByTypeId = new Map<number, RequiredSkill[]>();
  const missingDogma: number[] = [];
  await Promise.all(
    [...resolvedIds].map(async (typeId) => {
      const result = await loadType(typeId);
      const dogmaAttributes = result?.data?.dogma_attributes;
      if (!dogmaAttributes) {
        missingDogma.push(typeId);
        requiredByTypeId.set(typeId, []);
        return;
      }
      requiredByTypeId.set(typeId, extractRequiredSkills(dogmaAttributes));
    })
  );

  const requiredSkills: RequiredSkillsLookup = (typeId) => requiredByTypeId.get(typeId) ?? [];
  const { entries, errors: fitErrors } = fitToSkills(fit, typeByName, requiredSkills);

  // Fits repeat items across multiple slots (three turrets loaded with the
  // same unresolvable faction ammo, say), which would otherwise print the
  // same "Unknown item" line once per slot. Dedupe by item name, keeping
  // first-occurrence order, and note the repeat count instead.
  const unknownItemCounts = new Map<string, number>();
  for (const e of fitErrors) {
    unknownItemCounts.set(e.itemName, (unknownItemCounts.get(e.itemName) ?? 0) + 1);
  }
  const unknownItemWarnings = [...unknownItemCounts.entries()].map(([name, count]) =>
    count > 1 ? `Unknown item: ${name} ×${count}` : `Unknown item: ${name}`
  );

  const warnings = [
    ...unknownItemWarnings,
    ...missingDogma
      .sort((a, b) => a - b)
      .map((id) => `Requirements unknown for type #${id} (not cached — reconnect and retry)`),
  ];

  return {
    mode: 'eftFit',
    shipName: fit.shipName,
    fitName: fit.fitName,
    entries,
    warnings,
    errors,
  };
}

function previewSkillPlan(
  text: string,
  { skillByName }: ClipboardImportDeps
): ClipboardImportPreview {
  const { entries, errors } = parseSkillPlanPaste(text, skillByName);
  return {
    mode: 'skillPlan',
    entries,
    warnings: [],
    errors: errors.map((e) => ({ line: e.line, text: e.text, reason: e.reason })),
  };
}

export async function previewClipboardImport(
  text: string,
  deps: ClipboardImportDeps
): Promise<ClipboardImportPreview> {
  return detectMode(text) === 'eftFit' ? previewEftFit(text, deps) : previewSkillPlan(text, deps);
}
