/**
 * What an Opportunities row was priced from: a reaction formula, a BPO or a
 * BPC, with its runs. Shared by the desktop table and the phone cards.
 */
import { useTranslation } from 'react-i18next';
import { StatChip } from '@/components/ui';
import { isReaction, type OpportunityCandidate } from './opportunities';
import { blueprintKindKey } from './opportunityMetrics';

export function OpportunityBlueprintChip({ candidate }: { candidate: OpportunityCandidate }) {
  const { t } = useTranslation();
  const original = candidate.blueprint.runs === -1;
  return (
    <StatChip
      label={t(blueprintKindKey(candidate))}
      value={original ? t('industry.opportunitiesUnlimitedRuns') : candidate.blueprint.runs}
      tone={original && !isReaction(candidate) ? 'accent' : 'default'}
    />
  );
}
