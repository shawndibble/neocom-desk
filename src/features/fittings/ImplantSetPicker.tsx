/**
 * Edits the implant/booster set a Fitting carries.
 *
 * Adds by exact (case-insensitive) item name via the same `loadItemNameMap`
 * the EFT loader resolves names through, from one box: the implant catalog
 * (`loadImplantCatalog`) says whether the item is an implant or a booster,
 * and so which list it joins.
 *
 * Given the open Fitting and pilot (`finder`), it opens on "Find by goal"
 * (`ImplantFinder`) instead, with this list under "Your set".
 *
 * It's a planner: on "My clone" with no set of the Fitting's own, it starts
 * from the clone's implants, and the first change saves that plan to the
 * Fitting — which is what puts the page on it — while opening it alone
 * changes nothing. "Use my clone" drops the set again.
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
import { tappableRowClassName } from '@/components/ui/controlStyles';
import { MAX_BOOSTERS, MAX_IMPLANTS } from '@/engine/fitting/fittingShare';
import type { ImplantBasis } from '@/engine/fittings/implantBasis';
import type { Fitting, FittingImplantSet, PilotProfile } from '@/engine/fittings/types';
import { loadItemNameMap } from '@/features/skills/typeCatalog';
import { loadTypeNames } from '@/features/character/typeNames';
import { ItemDetailModal } from '@/features/market/ItemDetailModal';
import { ImplantFinder } from './ImplantFinder';
import { loadImplantCatalog } from './useImplantFinder';

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
  };
  /** Drops the Fitting's own set, so the stats go back to the clone; absent: no clone to go back to. */
  onUseClone?: () => void;
}

/** Stable identity: a fresh `{implants: [], boosters: []}` every render would
 * re-fire the name-resolve effect below every render whenever no set is
 * carried yet — the common case for a freshly-loaded Fitting. */
const EMPTY_SET: FittingImplantSet = { implants: [], boosters: [] };

interface SlotListProps {
  heading: string;
  typeIds: readonly number[];
  names: Map<number, string>;
  /** By position, not type id — a set may legally carry the same id twice. */
  onRemove: (index: number) => void;
  /** Opens an entry's details (Show Info), from its name. */
  onInfo: (typeId: number) => void;
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

/** One box for both lists: the item itself decides where it goes. */
function AddItemForm({
  disabled,
  onAdd,
  error,
}: {
  disabled: boolean;
  onAdd: (name: string) => void;
  error: string | null;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  return (
    <div className="space-y-1">
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
          disabled={disabled}
          aria-label={t('fittings.implants.addLabel')}
        />
        <Button type="submit" size="sm" disabled={disabled || query.trim() === ''}>
          {t('fittings.implants.add')}
        </Button>
      </form>
      {disabled && <p className="text-xs text-warning">{t('fittings.implants.full')}</p>}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

function SlotList({ heading, typeIds, names, onRemove, onInfo, renderDetail }: SlotListProps) {
  const { t } = useTranslation();

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
                  <button
                    type="button"
                    className={`${tappableRowClassName} min-w-0 flex-1 cursor-pointer truncate text-left text-sm text-accent underline-offset-2 hover:underline`}
                    onClick={() => onInfo(typeId)}
                  >
                    {name}
                  </button>
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
    </div>
  );
}

export function ImplantSetPicker({
  open,
  onClose,
  implantSet,
  onChange,
  finder,
  onUseClone,
}: ImplantSetPickerProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'find' | 'set'>('find');
  const [nameMap, setNameMap] = useState<Map<string, { typeID: number }>>(new Map());
  const [names, setNames] = useState<Map<number, string>>(new Map());
  const [addError, setAddError] = useState<string | null>(null);
  const [infoTypeId, setInfoTypeId] = useState<number | null>(null);

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

  useEffect(() => {
    if (!open) return;
    void loadItemNameMap().then(setNameMap);
    void loadImplantCatalog().catch(() => undefined); // warm, so an add sorts at once
  }, [open]);

  useEffect(() => {
    if (!open) return;
    void loadTypeNames([...set.implants, ...set.boosters]).then(setNames);
  }, [open, set.implants, set.boosters]);

  async function add(rawName: string) {
    const entry = nameMap.get(rawName.toLowerCase());
    if (!entry) {
      setAddError(t('fittings.implants.notFound'));
      return;
    }
    const place = await loadImplantCatalog().then(
      (catalog) => catalog.slotOf(entry.typeID),
      () => undefined
    );
    if (!place) {
      setAddError(t('fittings.implants.notImplantOrBooster', { name: rawName }));
      return;
    }
    const kind = place.kind === 'booster' ? 'boosters' : 'implants';
    if (set[kind].length >= (kind === 'boosters' ? MAX_BOOSTERS : MAX_IMPLANTS)) {
      setAddError(
        t(kind === 'boosters' ? 'fittings.implants.boostersFull' : 'fittings.implants.implantsFull')
      );
      return;
    }
    setAddError(null);
    onChange({ ...set, [kind]: [...set[kind], entry.typeID] });
  }

  function removeFrom(kind: 'implants' | 'boosters', index: number) {
    const remaining = set[kind].filter((_, i) => i !== index);
    // A side effect whose booster is gone goes with it.
    onChange(kind === 'boosters' ? withBoosters(set, remaining) : { ...set, implants: remaining });
  }

  function toggleSideEffect(effectId: number, on: boolean) {
    const current = set.boosterSideEffects ?? [];
    const sideEffects = on
      ? [...current.filter((id) => id !== effectId), effectId]
      : current.filter((id) => id !== effectId);
    onChange({
      implants: set.implants,
      boosters: set.boosters,
      ...(sideEffects.length > 0 ? { boosterSideEffects: sideEffects } : {}),
    });
  }

  const setEditor = (
    <div className="space-y-4">
      <AddItemForm
        disabled={set.implants.length >= MAX_IMPLANTS && set.boosters.length >= MAX_BOOSTERS}
        onAdd={(name) => void add(name)}
        error={addError}
      />
      <SlotList
        heading={t('fittings.implants.implantsHeading')}
        typeIds={set.implants}
        names={names}
        onRemove={(index) => removeFrom('implants', index)}
        onInfo={setInfoTypeId}
      />
      <SlotList
        heading={t('fittings.implants.boostersHeading')}
        typeIds={set.boosters}
        names={names}
        onRemove={(index) => removeFrom('boosters', index)}
        onInfo={setInfoTypeId}
        renderDetail={(typeId) => (
          <SideEffectSwitches
            boosterTypeId={typeId}
            switchedOn={set.boosterSideEffects ?? []}
            onToggle={toggleSideEffect}
          />
        )}
      />
      {infoTypeId !== null && (
        <ItemDetailModal
          typeId={infoTypeId}
          itemName={
            names.get(infoTypeId) ?? t('fittings.implants.unknownType', { typeId: infoTypeId })
          }
          onClose={() => setInfoTypeId(null)}
          showOpenInMarket
        />
      )}
    </div>
  );

  // What the stats are on now, and the way back to the clone from a set.
  const inUse = (
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-text-dim">
      <p>
        {implantSet === undefined && onUseClone
          ? t('fittings.implants.cloneExplain')
          : t('fittings.implants.fittingExplain')}
      </p>
      {implantSet !== undefined && onUseClone && (
        <Button size="sm" onClick={onUseClone}>
          {t('fittings.implants.useClone')}
        </Button>
      )}
    </div>
  );

  if (!finder || !plannedFitting) {
    return (
      <Modal open={open} onClose={onClose} title={t('fittings.implants.modalTitle')}>
        <div className="space-y-3 p-3">
          {inUse}
          {setEditor}
        </div>
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
        {inUse}
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
            onChange={onChange}
          />
        ) : (
          setEditor
        )}
      </div>
    </Modal>
  );
}
