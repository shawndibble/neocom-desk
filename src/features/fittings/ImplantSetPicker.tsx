/**
 * Edits the implant/booster set a Fitting carries.
 *
 * Adds by exact (case-insensitive) item name via the same `loadItemNameMap`
 * the EFT loader resolves names through — there is no per-slot SDE attribute
 * baked into this build's snapshot to drive a "browse implant slot 3" style
 * picker, so this trims to a name-search add/remove list instead.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Checkbox, IconButton, Modal, SearchInput, TypeIcon } from '@/components/ui';
import { boosterSideEffects } from '@/engine/fittings/boosterSideEffects';
import * as Icon from '@/components/ui/icons';
import { MAX_BOOSTERS, MAX_IMPLANTS } from '@/engine/fitting/fittingShare';
import type { FittingImplantSet } from '@/engine/fittings/types';
import { loadItemNameMap } from '@/features/skills/typeCatalog';
import { loadTypeNames } from '@/features/character/typeNames';

interface ImplantSetPickerProps {
  open: boolean;
  onClose: () => void;
  implantSet: FittingImplantSet | undefined;
  onChange: (implantSet: FittingImplantSet | undefined) => void;
}

/** Stable identity: a fresh `{implants: [], boosters: []}` every render would
 * re-fire the name-resolve effect below every render whenever no set is
 * carried yet — the common case for a freshly-loaded Fitting. */
const EMPTY_SET: FittingImplantSet = { implants: [], boosters: [] };

interface SlotListProps {
  heading: string;
  typeIds: readonly number[];
  max: number;
  names: Map<number, string>;
  onAdd: (name: string) => void;
  /** By position, not type id — a set may legally carry the same id twice. */
  onRemove: (index: number) => void;
  error: string | null;
  /** Under an entry: its own controls (a booster's side effects). */
  renderDetail?: (typeId: number) => ReactNode;
}

/**
 * A booster's side effects, each a switch: off by default (a booster is
 * assumed to roll none), on to see the fit with it.
 */
function SideEffectSwitches({
  boosterTypeId,
  switchedOn,
  onToggle,
}: {
  boosterTypeId: number;
  switchedOn: readonly number[];
  onToggle: (effectId: number, on: boolean) => void;
}) {
  const { t } = useTranslation();
  const effects = boosterSideEffects(boosterTypeId);
  if (effects.length === 0) return null;
  return (
    <fieldset className="mt-1 space-y-0.5 pl-8">
      <legend className="text-xs text-text-dim">{t('fittings.implants.sideEffects')}</legend>
      {effects.map((effect) => (
        <label
          key={effect.effectId}
          className="flex min-h-11 cursor-pointer items-center gap-2 text-xs md:min-h-7"
        >
          <Checkbox
            checked={switchedOn.includes(effect.effectId)}
            onChange={(event) => onToggle(effect.effectId, event.target.checked)}
          />
          {t('fittings.implants.sideEffect', {
            what: t(`fittings.implants.sideEffectName.${effect.effectId}`),
            pct: `${effect.penaltyPct > 0 ? '+' : '−'}${Math.abs(effect.penaltyPct)}`,
          })}
        </label>
      ))}
    </fieldset>
  );
}

function SlotList({
  heading,
  typeIds,
  max,
  names,
  onAdd,
  onRemove,
  error,
  renderDetail,
}: SlotListProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const full = typeIds.length >= max;

  return (
    <div className="space-y-2">
      <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
        {heading}
      </p>
      {typeIds.length === 0 ? (
        <p className="text-sm text-text-dim">{t('fittings.implants.empty')}</p>
      ) : (
        <ul className="space-y-1">
          {typeIds.map((typeId, index) => {
            const name = names.get(typeId) ?? t('fittings.implants.unknownType', { typeId });
            return (
              <li
                key={`${typeId}-${index}`} // ids may repeat — see onRemove's own doc
                className="rounded-xs bg-panel-2 p-1.5"
              >
                <div className="flex items-center gap-2">
                  <TypeIcon typeId={typeId} size={32} width={20} height={20} />
                  <span className="flex-1 truncate text-sm">{name}</span>
                  <IconButton
                    variant="plain"
                    size="sm"
                    tone="danger"
                    icon={<Icon.Close />}
                    label={t('fittings.implants.remove', { name })}
                    onClick={() => onRemove(index)}
                  />
                </div>
                {renderDetail?.(typeId)}
              </li>
            );
          })}
        </ul>
      )}
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (query.trim() === '') return;
          onAdd(query.trim());
          setQuery('');
        }}
      >
        <SearchInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('fittings.implants.addPlaceholder')}
          disabled={full}
          aria-label={heading}
        />
        <Button type="submit" size="sm" disabled={full || query.trim() === ''}>
          {t('fittings.implants.add')}
        </Button>
      </form>
      {full && <p className="text-xs text-warning">{t('fittings.implants.full')}</p>}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

export function ImplantSetPicker({ open, onClose, implantSet, onChange }: ImplantSetPickerProps) {
  const { t } = useTranslation();
  const [nameMap, setNameMap] = useState<Map<string, { typeID: number }>>(new Map());
  const [names, setNames] = useState<Map<number, string>>(new Map());
  const [implantError, setImplantError] = useState<string | null>(null);
  const [boosterError, setBoosterError] = useState<string | null>(null);

  const set = implantSet ?? EMPTY_SET;

  useEffect(() => {
    if (!open) return;
    void loadItemNameMap().then(setNameMap);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    void loadTypeNames([...set.implants, ...set.boosters]).then(setNames);
  }, [open, set.implants, set.boosters]);

  function addTo(kind: 'implants' | 'boosters', rawName: string) {
    const entry = nameMap.get(rawName.toLowerCase());
    const setError = kind === 'implants' ? setImplantError : setBoosterError;
    if (!entry) {
      setError(t('fittings.implants.notFound'));
      return;
    }
    setError(null);
    void onChange({ ...set, [kind]: [...set[kind], entry.typeID] });
  }

  function removeFrom(kind: 'implants' | 'boosters', index: number) {
    const next = { ...set, [kind]: set[kind].filter((_, i) => i !== index) };
    // A side effect whose booster is gone goes with it.
    if (kind === 'boosters' && set.boosterSideEffects) {
      const kept = next.boosters.flatMap((typeId) =>
        boosterSideEffects(typeId).map((effect) => effect.effectId)
      );
      const sideEffects = set.boosterSideEffects.filter((id) => kept.includes(id));
      if (sideEffects.length > 0) next.boosterSideEffects = sideEffects;
      else delete next.boosterSideEffects;
    }
    void onChange(next);
  }

  function toggleSideEffect(effectId: number, on: boolean) {
    const current = set.boosterSideEffects ?? [];
    const sideEffects = on
      ? [...current.filter((id) => id !== effectId), effectId]
      : current.filter((id) => id !== effectId);
    void onChange({
      implants: set.implants,
      boosters: set.boosters,
      ...(sideEffects.length > 0 ? { boosterSideEffects: sideEffects } : {}),
    });
  }

  return (
    <Modal open={open} onClose={onClose} title={t('fittings.implants.modalTitle')}>
      <div className="space-y-4 p-3">
        <SlotList
          heading={t('fittings.implants.implantsHeading')}
          typeIds={set.implants}
          max={MAX_IMPLANTS}
          names={names}
          onAdd={(name) => addTo('implants', name)}
          onRemove={(index) => removeFrom('implants', index)}
          error={implantError}
        />
        <SlotList
          heading={t('fittings.implants.boostersHeading')}
          typeIds={set.boosters}
          max={MAX_BOOSTERS}
          names={names}
          onAdd={(name) => addTo('boosters', name)}
          onRemove={(index) => removeFrom('boosters', index)}
          error={boosterError}
          renderDetail={(typeId) => (
            <SideEffectSwitches
              boosterTypeId={typeId}
              switchedOn={set.boosterSideEffects ?? []}
              onToggle={toggleSideEffect}
            />
          )}
        />
      </div>
    </Modal>
  );
}
