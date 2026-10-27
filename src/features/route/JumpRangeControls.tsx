/**
 * The Jump Range filter's controls, shared by Market Browser, Item Offers and
 * BPC Sourcing: the range select, the Current System it measures from, and a
 * note for when it cannot measure at all.
 *
 * The range select is a plain controlled field so it can sit inside a
 * `FilterBar`'s draft. The Current System picker writes its setting straight
 * away — it is where the pilot is, not part of any one page's filter.
 */
import { useTranslation } from 'react-i18next';
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import { JUMP_RANGES, type JumpRange } from '@/engine/route/jumpRange';
import type { CurrentSystemState, JumpRangeStatus } from './currentSystem';
import { SolarSystemPicker } from './SolarSystemPicker';
import { useSystemName } from './useSolarSystems';

interface JumpRangeSelectProps {
  value: JumpRange;
  onChange: (next: JumpRange) => void;
  className?: string;
  /**
   * What "no range" reads as. Market Browser names the scope its book falls
   * back to (the header's hub or region); elsewhere it is "Any distance".
   */
  anyLabel?: string;
}

export function JumpRangeSelect({
  value,
  onChange,
  className = 'w-40',
  anyLabel,
}: JumpRangeSelectProps) {
  const { t } = useTranslation();
  return (
    <Select value={value} onValueChange={(next) => onChange(next as JumpRange)}>
      <SelectTrigger aria-label={t('jumpRange.label')} className={className}>
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

/**
 * "From: Jita" — a `SolarSystemPicker` whose pick is the Current System
 * setting, with a way back to the game location.
 */
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
      // A pick made before ESI answers would record no game location, and
      // the answer arriving a moment later would then clear it.
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
          <Button
            size="sm"
            onClick={() => {
              current.clearPick();
              close();
            }}
          >
            {t('jumpRange.useGameLocation')}
          </Button>
        )
      }
    />
  );
}

/** Why a set range is not filtering, or nothing when it is (or is off). */
export function JumpRangeNote({ status }: { status: JumpRangeStatus }) {
  const { t } = useTranslation();
  if (status !== 'no-origin' && status !== 'unknown') return null;
  return (
    <p role="status" className="text-text-dim">
      {t(status === 'no-origin' ? 'jumpRange.noOrigin' : 'jumpRange.graphUnavailable')}
    </p>
  );
}
