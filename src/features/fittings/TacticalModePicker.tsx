/**
 * A Tactical Destroyer's mode — Defense, Propulsion or Sharpshooter — picked
 * beside the Fitting's other conditions. Part of the Fitting (it rides the
 * Share Link), so a change is an edit. Renders nothing for a hull without modes.
 */
import { useTranslation } from 'react-i18next';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui';
import {
  defaultTacticalMode,
  tacticalModeKind,
  tacticalModesFor,
} from '@/engine/fittings/tacticalModes';
import type { Fitting } from '@/engine/fittings/types';

/**
 * The Fitting in `mode`. The hull's default leaves no `mode` at all — it's
 * what a Fitting without one flies in anyway, and a link without it stays in
 * the format every older build reads.
 */
function withMode(fitting: Fitting, mode: number): Fitting {
  if (mode !== defaultTacticalMode(fitting.shipTypeId)) return { ...fitting, mode };
  const { mode: _default, ...rest } = fitting;
  void _default;
  return rest;
}

export function TacticalModePicker({
  fitting,
  onChange,
}: {
  fitting: Fitting;
  /** The editor's `edit()`: applies a change to the open Fitting. */
  onChange: (change: (fitting: Fitting) => Fitting) => void;
}) {
  const { t } = useTranslation();
  const modes = tacticalModesFor(fitting.shipTypeId);
  if (modes.length === 0) return null;
  const current =
    fitting.mode !== undefined && modes.includes(fitting.mode)
      ? fitting.mode
      : defaultTacticalMode(fitting.shipTypeId)!;
  const label = t('fittings.mode.label');

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-text-dim">{label}</span>
      <Select
        value={String(current)}
        onValueChange={(value) => onChange((f) => withMode(f, Number(value)))}
      >
        <SelectTrigger aria-label={label} className="w-56">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {modes.map((mode) => (
            <SelectItem key={mode} value={String(mode)}>
              {t(`fittings.mode.kind.${tacticalModeKind(mode) ?? 'defense'}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
