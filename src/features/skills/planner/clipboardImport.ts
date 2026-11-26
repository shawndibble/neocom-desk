import { looksLikeEftFit, parseEftFit } from '@/engine/import/eftFit';
import {
  fitToSkills,
  type RequiredSkill,
  type RequiredSkillsLookup,
} from '@/engine/import/fitToSkills';
import { parseSkillPlanPaste } from '@/engine/import/skillPlanPaste';
import { extractRequiredSkills } from '../dogma';
import type { TypeDetail } from '../typeDetail';
import type { PlanEntry } from '@/engine/types';
import type { TypeCatalogEntry } from '../typeCatalog';
import type { PlanXmlDocumentErrorCode } from './planXmlDocument';

export type ClipboardImportMode = 'skillPlan' | 'eftFit' | 'planXml';

export interface ClipboardImportLineIssue {
  line: number;
  text: string;
  reason: string;
}

export interface ClipboardImportPreview {
  mode: ClipboardImportMode;
  shipName?: string;
  fitName?: string;
  planName?: string;
  entries: PlanEntry[];
  warnings: string[];
  errors: ClipboardImportLineIssue[];
  documentErrorCode?: PlanXmlDocumentErrorCode;
}

export interface ClipboardImportDeps {
  skillByName: ReadonlyMap<string, TypeCatalogEntry>;
  typeByName: ReadonlyMap<string, TypeCatalogEntry>;
  loadType: (typeId: number) => Promise<Pick<TypeDetail, 'dogma_attributes'> | null>;
}

export function detectMode(text: string): ClipboardImportMode {
  return looksLikeEftFit(text) ? 'eftFit' : 'skillPlan';
}

async function previewEftFit(
  text: string,
  { typeByName, loadType }: ClipboardImportDeps
): Promise<ClipboardImportPreview> {
  const fit = parseEftFit(text);
  const errors = fit.errors.map((e) => ({ line: e.line, text: e.text, reason: e.reason }));

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
      const dogmaAttributes = (await loadType(typeId))?.dogma_attributes;
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

export type ImportOutcome = 'apply' | 'review' | 'empty';

export function importOutcome(preview: ClipboardImportPreview): ImportOutcome {
  if (preview.documentErrorCode || preview.errors.length > 0 || preview.warnings.length > 0) {
    return 'review';
  }
  return preview.entries.length === 0 ? 'empty' : 'apply';
}
