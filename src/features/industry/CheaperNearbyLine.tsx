import { useTranslation } from 'react-i18next';
import { EMPTY_RIG_FIT } from '@/engine/industry/types';
import { securityBand } from '@/engine/securityStatus';
import { formatIsk } from '@/lib/isk';
import { textActionClassName } from '@/components/ui/textActionClassName';
import { formatCostIndex } from './format';
import { clearedBuildLocation, type PlanPatch } from './planPatch';
import type { useCheaperNearbySystems } from './useCheaperNearbySystems';

interface CheaperNearbyLineProps {
  cheapest: ReturnType<typeof useCheaperNearbySystems>[number];
  saving: number;
  movePlan: (patch: PlanPatch) => void;
}

/** The Costs & revenue note offering a nearby system with a lower cost index, and the one-tap move there. */
export function CheaperNearbyLine({ cheapest, saving, movePlan }: CheaperNearbyLineProps) {
  const { t } = useTranslation();
  return (
    <>
      {t('industry.ledger.cheaperNearby', {
        system: cheapest.name,
        count: cheapest.jumps,
        index: formatCostIndex(cheapest.index),
        amount: formatIsk(saving),
      })}{' '}
      {/* The same move the build-system field makes: the band follows the
            system, and a picked structure is cleared since it was elsewhere. */}
      <button
        type="button"
        className={textActionClassName('inline-flex')}
        onClick={() =>
          movePlan({
            buildSystemId: cheapest.id,
            buildSystemName: cheapest.name,
            ...clearedBuildLocation,
            security: securityBand(cheapest.security),
            // The station found there is what the plan builds in: no rigs,
            // and the tax drops back to the NPC rate `jobFee` applies.
            ...(cheapest.npcStation
              ? {
                  facility: 'npcStation' as const,
                  rigFit: EMPTY_RIG_FIT,
                  facilityTaxPct: undefined,
                }
              : {}),
          })
        }
      >
        {t('industry.ledger.buildThere')}
      </button>
    </>
  );
}
