/**
 * A Tactical Destroyer's mode — Defense, Propulsion or Sharpshooter — picked
 * beside the Fitting's other conditions. Part of the Fitting (it rides the
 * Share Link), so a change is an edit. Renders nothing for a hull without modes.
 */
import { useTranslation } from 'react-i18next';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui';
import { defaultTacticalMode, tacticalModesFor } from '@/engine/fittings/tacticalModes';
import type { Fitting } from '@/engine/fittings/types';

export function TacticalModePicker({
  fitting,
  onChange,
  typeName,
}: {
  fitting: Fitting;
  /** The editor's `edit()`: applies a change to the open Fitting. */
  onChange: (change: (fitting: Fitting) => Fitting) => void;
  typeName: (typeId: number) => string;
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
        onValueChange={(value) => onChange((f) => ({ ...f, mode: Number(value) }))}
      >
        <SelectTrigger aria-label={label} className="w-56">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {modes.map((mode) => (
            <SelectItem key={mode} value={String(mode)}>
              {typeName(mode)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
