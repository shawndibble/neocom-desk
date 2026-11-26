import { useTranslation } from 'react-i18next';
import {
  LiveNote,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import { JUMP_RANGES, type JumpRange } from '@/engine/route/jumpRange';
import type { CurrentSystemState, JumpRangeStatus } from './currentSystem';
import { SolarSystemPicker } from './SolarSystemPicker';
import { UseGameLocationButton } from './UseGameLocationButton';
import { useSystemName } from './useSolarSystems';

interface JumpRangeSelectProps {
  value: JumpRange;
  onChange: (next: JumpRange) => void;
  className?: string;
  anyLabel?: string;
  active?: boolean;
}

export function JumpRangeSelect({
  value,
  onChange,
  className = 'w-40',
  anyLabel,
  active,
}: JumpRangeSelectProps) {
  const { t } = useTranslation();
  return (
    <Select value={value} onValueChange={(next) => onChange(next as JumpRange)}>
      <SelectTrigger aria-label={t('jumpRange.label')} className={className} active={active}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {JUMP_RANGES.map((range) => (
          <SelectItem key={range} value={range}>
            {range === 'any' && anyLabel !== undefined ? anyLabel : t(`jumpRange.option.${range}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

interface CurrentSystemPickerProps {
  current: CurrentSystemState;
}

export function CurrentSystemPicker({ current }: CurrentSystemPickerProps) {
  const { t } = useTranslation();
  const currentName = useSystemName(current.systemId);

  const label =
    current.systemId === null
      ? t('jumpRange.fromUnknown')
      : t('jumpRange.from', { system: currentName ?? '…' });

  return (
    <SolarSystemPicker
      value={current.systemId}
      onChange={(systemId) => current.pick(systemId)}
      disabled={!current.loaded}
      ariaLabel={t('jumpRange.changeSystem', { current: label })}
      triggerLabel={
        <>
          {label}
          {current.source === 'picked' && (
            <span className="text-text-dim">{t('jumpRange.pickedSuffix')}</span>
          )}
        </>
      }
      hint={
        current.source === 'picked'
          ? t('jumpRange.pickedHint')
          : current.source === 'game'
            ? t('jumpRange.gameHint')
            : t('jumpRange.noGameHint')
      }
      footer={(close) =>
        current.source === 'picked' && (
          <UseGameLocationButton onReset={current.clearPick} close={close} />
        )
      }
    />
  );
}

export function JumpRangeNote({ status }: { status: JumpRangeStatus }) {
  const { t } = useTranslation();
  if (status !== 'no-origin' && status !== 'unknown') return null;
  return (
    <LiveNote className="text-text-dim">
      {t(status === 'no-origin' ? 'jumpRange.noOrigin' : 'jumpRange.graphUnavailable')}
    </LiveNote>
  );
}
