/**
 * What an Opportunities row was priced from: a reaction formula, a BPO or a
 * BPC, with its runs. Shared by the desktop table and the phone cards.
 */
import { useTranslation } from 'react-i18next';
import { StatChip } from '@/components/ui';
import type { OpportunityCandidate } from './opportunities';

export function OpportunityBlueprintChip({ candidate }: { candidate: OpportunityCandidate }) {
  const { t } = useTranslation();
  const original = candidate.blueprint.runs === -1;
  const reaction = candidate.catalogEntry.blueprint.activity === 'reaction';
  return (
    <StatChip
      label={
        reaction
          ? t('industry.ownedBlueprintsActivity.reaction')
          : original
            ? t('industry.bpo')
            : t('industry.bpc')
      }
      value={original ? t('industry.opportunitiesUnlimitedRuns') : candidate.blueprint.runs}
      tone={original && !reaction ? 'accent' : 'default'}
    />
  );
}
