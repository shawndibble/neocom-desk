import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import type { CharacterAcceleratorRecord } from '@/db';
import { CharacterAcceleratorEditor } from '@/features/accelerator/CharacterAcceleratorEditor';
import { useCharacterAccelerators } from '@/features/accelerator/useAccelerators';
import { MarketGroupLink } from './MarketGroupLink';
import { CEREBRAL_ACCELERATORS_MARKET_GROUP_ID } from './plannerMarketGroups';

export function AcceleratorSection({
  characterId,
  running,
  detectedBonus,
  startAdding = false,
  showTitle = true,
}: {
  characterId: number;
  running: CharacterAcceleratorRecord | null;
  detectedBonus: number | null;
  startAdding?: boolean;
  showTitle?: boolean;
}) {
  const { t } = useTranslation();
  useCharacterAccelerators();
  const [adding, setAdding] = useState(startAdding);
  const shown = running !== null || detectedBonus !== null || adding;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-1.5">
        <span>
          {showTitle && t('plans.accelerator')}
          {running === null && detectedBonus !== null && (
            <span className={showTitle ? 'ml-2 font-semibold' : 'font-semibold'}>
              {t('plans.acceleratorDetected', { bonus: detectedBonus })}
            </span>
          )}
        </span>
        <MarketGroupLink
          groupId={CEREBRAL_ACCELERATORS_MARKET_GROUP_ID}
          label={t('plans.boosterMarketLink')}
        />
      </div>
      {shown ? (
        <CharacterAcceleratorEditor
          characterId={characterId}
          record={running ?? undefined}
          detectedBonus={detectedBonus}
        />
      ) : (
        <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
          <Icon.AddRow size={Icon.ICON_SIZE.sm} />
          {t('plans.boosterAdd')}
        </Button>
      )}
    </div>
  );
}
