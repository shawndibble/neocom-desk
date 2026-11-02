/**
 * The Characters table's Accelerator cell: whether the Character has a
 * cerebral accelerator running, the typed-in countdown when the pilot gave
 * one, and a pencil that opens the shared editor. A guess from the attribute
 * sheet says "Yes" without a countdown (no ESI endpoint knows when it ends).
 */
import { useTranslation } from 'react-i18next';
import { IconButton } from '@/components/ui';
import { HintText } from '@/components/ui/HintText';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover';
import * as Icon from '@/components/ui/icons';
import type { CharacterAcceleratorRecord } from '@/db';
import { isAcceleratorLive, resolveAccelerator } from '@/engine/accelerator';
import { CharacterAcceleratorEditor } from '@/features/accelerator/CharacterAcceleratorEditor';
import { formatCountdown } from '@/lib/duration';
import { formatTimestamp } from '@/lib/timestamp';

interface AcceleratorCellProps {
  characterId: number;
  name: string;
  record: CharacterAcceleratorRecord | undefined;
  detectedBonus: number | null;
  timeZone: 'UTC' | undefined;
}

export function AcceleratorCell({
  characterId,
  name,
  record,
  detectedBonus,
  timeZone,
}: AcceleratorCellProps) {
  const { t } = useTranslation();
  // eslint-disable-next-line react-hooks/purity -- display-only: the countdown reads the clock, like the Training column
  const now = Date.now();
  const state = resolveAccelerator(record, detectedBonus, now);

  let value;
  if (state.kind === 'manual') {
    value = (
      <HintText
        content={t('characters.acceleratorEnds', {
          at: formatTimestamp(new Date(state.expiresAt), timeZone),
        })}
      >
        {t('characters.acceleratorManual', {
          bonus: state.bonus,
          left: formatCountdown((state.expiresAt - now) / 1000),
        })}
      </HintText>
    );
  } else if (state.kind === 'detected') {
    value = (
      <HintText content={t('characters.acceleratorDetectedHint')}>
        {t('characters.acceleratorDetected', { bonus: state.bonus })}
      </HintText>
    );
  } else {
    value = <span className="text-text-dim">{t('characters.acceleratorNone')}</span>;
  }

  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      {value}
      <Popover>
        <PopoverTrigger asChild>
          <IconButton
            icon={<Icon.Rename size={Icon.ICON_SIZE.sm} />}
            label={t('characters.acceleratorEdit', { name })}
            size="sm"
            variant="plain"
          />
        </PopoverTrigger>
        <PopoverContent
          align="start"
          aria-label={t('characters.acceleratorEdit', { name })}
          className="w-80 space-y-3 p-3"
        >
          <CharacterAcceleratorEditor
            characterId={characterId}
            record={isAcceleratorLive(record, now) ? record : undefined}
            detectedBonus={detectedBonus}
          />
        </PopoverContent>
      </Popover>
    </span>
  );
}
