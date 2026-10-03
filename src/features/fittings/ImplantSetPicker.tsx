/**
 * Edits the implant/booster set a Fitting carries.
 *
 * Adds by exact (case-insensitive) item name via the same `loadItemNameMap`
 * the EFT loader resolves names through — there is no per-slot SDE attribute
 * baked into this build's snapshot to drive a "browse implant slot 3" style
 * picker, so this trims to a name-search add/remove list instead.
 *
 * Given the open Fitting and pilot (`finder`), it opens on "Find by goal"
 * (`ImplantFinder`) instead, with this list under "Your set".
 *
 * It's a planner: on "My clone" with no set of the Fitting's own, it starts
 * from the clone's implants, and the first change saves that plan to the
 * Fitting and switches the page to it — opening it alone changes nothing.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Checkbox,
  IconButton,
  Modal,
  SearchInput,
  Tabs,
  TypeIcon,
  type TabItem,
} from '@/components/ui';
import { boosterSideEffects, withBoosters } from '@/engine/fittings/boosterSideEffects';
import * as Icon from '@/components/ui/icons';
import { MAX_BOOSTERS, MAX_IMPLANTS } from '@/engine/fitting/fittingShare';
import type { ImplantBasis } from '@/engine/fittings/implantBasis';
import type { Fitting, FittingImplantSet, PilotProfile } from '@/engine/fittings/types';
import { loadItemNameMap } from '@/features/skills/typeCatalog';
import { loadTypeNames } from '@/features/character/typeNames';
import { ImplantFinder } from './ImplantFinder';

interface ImplantSetPickerProps {
  open: boolean;
  onClose: () => void;
  implantSet: FittingImplantSet | undefined;
  onChange: (implantSet: FittingImplantSet | undefined) => void;
  /** The open Fitting and pilot: turns on "Find by goal". */
  finder?: {
    fitting: Fitting;
    profile: PilotProfile;
    basis: ImplantBasis;
    /** Called with "fitting" when a change is made on "My clone", so the page shows the plan. */
    onBasisChange?: (basis: ImplantBasis) => void;
  };
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

export function ImplantSetPicker({
  open,
  onClose,
  implantSet,
  onChange,
  finder,
}: ImplantSetPickerProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'find' | 'set'>('find');
  const [nameMap, setNameMap] = useState<Map<string, { typeID: number }>>(new Map());
  const [names, setNames] = useState<Map<number, string>>(new Map());
  const [implantError, setImplantError] = useState<string | null>(null);
  const [boosterError, setBoosterError] = useState<string | null>(null);

  const fitting = finder?.fitting;
  const onClone = finder?.basis === 'clone';
  const cloneImplants = finder?.profile.implantTypeIds;
  /** The clone's implants, as the plan to start from — see this file's own doc. */
  const seed = useMemo<FittingImplantSet | undefined>(
    () =>
      onClone && implantSet === undefined && cloneImplants && cloneImplants.length > 0
        ? { implants: [...cloneImplants], boosters: [] }
        : undefined,
    [onClone, implantSet, cloneImplants]
  );
  // Stable per Fitting and seed: the finder re-screens every family whenever this changes.
  const plannedFitting = useMemo(
    () => (fitting && seed ? { ...fitting, implantSet: seed } : fitting),
    [fitting, seed]
  );
  const set = implantSet ?? seed ?? EMPTY_SET;
  const onBasisChange = finder?.onBasisChange;
  function change(next: FittingImplantSet | undefined) {
    onChange(next);
    if (onClone) onBasisChange?.('fitting');
  }

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
    change({ ...set, [kind]: [...set[kind], entry.typeID] });
  }

  function removeFrom(kind: 'implants' | 'boosters', index: number) {
    const remaining = set[kind].filter((_, i) => i !== index);
    // A side effect whose booster is gone goes with it.
    change(kind === 'boosters' ? withBoosters(set, remaining) : { ...set, implants: remaining });
  }

  function toggleSideEffect(effectId: number, on: boolean) {
    const current = set.boosterSideEffects ?? [];
    const sideEffects = on
      ? [...current.filter((id) => id !== effectId), effectId]
      : current.filter((id) => id !== effectId);
    change({
      implants: set.implants,
      boosters: set.boosters,
      ...(sideEffects.length > 0 ? { boosterSideEffects: sideEffects } : {}),
    });
  }

  const setEditor = (
    <div className="space-y-4">
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
  );

  if (!finder || !plannedFitting) {
    return (
      <Modal open={open} onClose={onClose} title={t('fittings.implants.modalTitle')}>
        <div className="p-3">{setEditor}</div>
      </Modal>
    );
  }
  const tabs: TabItem[] = [
    { id: 'find', label: t('fittings.implantFinder.tabFind') },
    { id: 'set', label: t('fittings.implantFinder.tabSet') },
  ];
  return (
    <Modal open={open} onClose={onClose} title={t('fittings.implants.modalTitle')} placement="wide">
      <div className="space-y-3 p-3">
        <Tabs
          tabs={tabs}
          value={tab}
          onChange={(id) => setTab(id as 'find' | 'set')}
          label={t('fittings.implants.modalTitle')}
        />
        {tab === 'find' ? (
          <ImplantFinder
            open={open}
            fitting={plannedFitting}
            profile={finder.profile}
            basis={finder.basis}
            implantSet={set}
            onChange={change}
          />
        ) : (
          setEditor
        )}
      </div>
    </Modal>
  );
}
