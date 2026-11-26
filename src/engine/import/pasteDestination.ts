import { isSurveyScanText } from '@/engine/survey/parseScan';
import { looksLikeBlueprintList } from '@/engine/import/blueprintList';
import { looksLikeEftFit, parseEftFit } from '@/engine/import/eftFit';
import { parseSkillPlanPaste, type SkillCatalog } from '@/engine/import/skillPlanPaste';
import { matchAppraisalEntries, type AppraisalCatalogue } from '@/engine/market/appraisalMatch';
import { parseAppraisalPaste } from '@/engine/market/appraisalPaste';
import { classifyPilotPaste } from '@/engine/pilotList/parsePilotPaste';

export type PasteDestination =
  'survey' | 'fitting' | 'dscan' | 'blueprintList' | 'skillPlan' | 'appraisal' | 'pilotList';

export interface PasteSources {
  catalogue: AppraisalCatalogue;
  hullNames: ReadonlySet<string>;
  skillByName: SkillCatalog;
  blueprintNames?: ReadonlySet<string>;
}

export type PasteVerdict = 'match' | 'veto' | 'pass';

export interface PasteDetector<Id extends string = PasteDestination> {
  id: Id;
  detect: (text: string, sources: PasteSources) => PasteVerdict;
}

export const PASTE_DETECTORS: readonly PasteDetector[] = [
  {
    id: 'survey',
    detect: (text) => (isSurveyScanText(text) ? 'match' : 'pass'),
  },
  {
    id: 'fitting',
    detect: (text, { hullNames }) => {
      if (!looksLikeEftFit(text)) return 'pass';
      const shipName = parseEftFit(text).shipName.trim().toLowerCase();
      return shipName !== '' && hullNames.has(shipName) ? 'match' : 'veto';
    },
  },
  {
    id: 'dscan',
    detect: (text) => (classifyPilotPaste(text)?.kind === 'dscan' ? 'match' : 'pass'),
  },
  {
    id: 'blueprintList',
    detect: (text, { blueprintNames }) =>
      blueprintNames && looksLikeBlueprintList(text, blueprintNames) ? 'match' : 'pass',
  },
  {
    id: 'skillPlan',
    detect: (text, { skillByName }) => {
      const plan = parseSkillPlanPaste(text, skillByName);
      return plan.entries.length > 0 && plan.errors.length === 0 ? 'match' : 'pass';
    },
  },
  {
    id: 'appraisal',
    detect: (text, { catalogue }) => {
      const entries = parseAppraisalPaste(text);
      if (entries.length === 0) return 'pass';
      const { matched, unmatched } = matchAppraisalEntries(entries, catalogue);
      return matched.length > unmatched.length ? 'match' : 'pass';
    },
  },
  {
    id: 'pilotList',
    detect: (text) => (classifyPilotPaste(text)?.kind === 'local' ? 'match' : 'pass'),
  },
];

export function detectPasteDestination<Id extends string>(
  text: string,
  sources: PasteSources,
  detectors: readonly PasteDetector<Id>[]
): Id | null {
  if (text.trim() === '') return null;
  for (const { id, detect } of detectors) {
    const verdict = detect(text, sources);
    if (verdict === 'match') return id;
    if (verdict === 'veto') return null;
  }
  return null;
}

export function pasteDestination(text: string, sources: PasteSources): PasteDestination | null {
  return detectPasteDestination(text, sources, PASTE_DETECTORS);
}
