import { idSetKey } from '@/lib/idSetKey';
/**
 * "Mutation" in a fitted module's dialog (GLOSSARY.md **Mutated module**,
 * **Mutaplasmid**, **Roll**): apply a mutaplasmid to the module, roll each
 * attribute it changes on a slider, load a real item's rolls from the
 * pilot's assets, or take the mutation off again. Every change is an
 * ordinary editor edit, so the stats and the Fitting Share Code follow.
 *
 * Drones are not covered: a mutated drone is its own one-drone stack, and
 * the drone rows have no dialog to hold this.
 */
import { lazy, Suspense, useEffect, useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
  Slider,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import {
  mutationStatus,
  type Mutaplasmid,
  type MutaplasmidLookup,
} from '@/engine/fittings/mutaplasmids';
import {
  groupMutaplasmidsByStrain,
  rollAtQuality,
  rollRows,
  setModuleMutation,
  setModuleRoll,
  startingRolls,
  type BaseValue,
  type RollRow,
} from '@/engine/fittings/mutationEdit';
import type { FittingModule, ItemMutation } from '@/engine/fittings/types';
import { useMutaplasmidLookup } from '@/features/abyssal/mutaplasmidData';
import { useFocusAfterCommit } from '@/lib/useFocusAfterCommit';
import { attributeValueText, formatAttributeNumber } from './attributeValueText';
import { loadBaseValues } from './loadBaseValues';
import { useAttributeDictionary } from './useAttributeDictionary';
import { catalogueTypeName, type FittingCatalogue } from './useFittingCatalogue';
import type { FittingChange } from './useFittingWorkspace';
import { guarded } from '@/app/routeChunks';

const MutationFromAssets = lazy(() =>
  guarded(() => import('./MutationFromAssets')).then((m) => ({ default: m.MutationFromAssets }))
);

/** Slider positions from worst to best: one arrow-key press is 1%, the step the printed roll shows. */
const STEPS = 100;

/** The base module's own attribute values; null while they load (or for no base), 'failed' when unreadable. */
function useBaseValues(typeId: number | null): BaseValue | 'failed' | null {
  const [loaded, setLoaded] = useState<{ typeId: number; value: BaseValue | null } | null>(null);
  useEffect(() => {
    if (typeId === null) return;
    let live = true;
    void loadBaseValues(typeId, { retry: true }).then((value) => {
      if (live) setLoaded({ typeId, value });
    });
    return () => {
      live = false;
    };
  }, [typeId]);
  if (typeId === null || loaded?.typeId !== typeId) return null;
  return loaded.value ?? 'failed';
}

export interface FittingMutationPanelProps {
  module: FittingModule;
  catalogue: FittingCatalogue | null;
  edit: (change: FittingChange, coalesceKey?: string) => void;
  /** The active Character, whose assets "Load rolls from my assets" reads; null hides it. */
  characterId: number | null;
}

export function FittingMutationPanel(props: FittingMutationPanelProps) {
  const { t } = useTranslation();
  const lookup = useMutaplasmidLookup();
  if (lookup === null)
    return <p className="text-xs text-text-dim">{t('fittings.mutation.loading')}</p>;
  return <MutationEditor {...props} lookup={lookup} />;
}

function MutationEditor({
  module,
  catalogue,
  edit,
  characterId,
  lookup,
}: FittingMutationPanelProps & { lookup: MutaplasmidLookup }) {
  const { t } = useTranslation();
  const nameOf = (typeId: number) => catalogueTypeName(catalogue, typeId);
  const status = mutationStatus(module, lookup);
  const { slot, slotIndex } = module;
  const mutation = module.mutation;
  const baseTypeId = status === 'none' ? module.typeId : (mutation?.baseTypeId ?? null);
  const base = useBaseValues(baseTypeId);
  const baseFailed = base === 'failed';
  const baseValue = baseFailed ? null : base;
  const dictionary = useAttributeDictionary();
  const pickerId = useId();
  const focusAfterCommit = useFocusAfterCommit();

  const apply = (next: ItemMutation | null) =>
    edit((f) => setModuleMutation(f, slot, slotIndex, next, lookup));
  // Remove mutation, the base pick and an owned-item pick unmount the control that ran them; the
  // picker takes focus once enabled (it waits on the new base's values).
  const focusPicker = () =>
    focusAfterCommit(() => {
      const picker = document.getElementById(pickerId);
      return picker instanceof HTMLButtonElement && !picker.disabled ? picker : null;
    });

  // What "Load rolls from my assets" looks for: this abyssal type, or every
  // one this base can become.
  const assetTypes =
    status === 'none'
      ? new Set(lookup.mutaplasmidsForBase(module.typeId).map((m) => m.resultTypeId))
      : new Set([module.typeId]);
  const fromAssets = characterId !== null && (
    <Suspense fallback={null}>
      <MutationFromAssets
        // Another Character or base starts a fresh search: the old one's items aren't these.
        key={`${characterId}:${idSetKey(assetTypes)}`}
        characterId={characterId}
        typeIds={assetTypes}
        lookup={lookup}
        nameOf={nameOf}
        onApply={(owned) => {
          apply(owned);
          focusPicker();
        }}
      />
    </Suspense>
  );

  if (status === 'baseUnknown') {
    return (
      <div className="space-y-3 text-xs">
        <WarnNote>{t('fittings.mutation.baseUnknownNote')}</WarnNote>
        <BasePicker
          resultTypeId={module.typeId}
          lookup={lookup}
          nameOf={nameOf}
          onPick={(mutaplasmidTypeId, baseTypeId) => {
            apply({ baseTypeId, mutaplasmidTypeId, attributes: {} });
            focusPicker();
          }}
        />
        {fromAssets}
      </div>
    );
  }

  const options = baseTypeId === null ? [] : lookup.mutaplasmidsForBase(baseTypeId);
  const rows =
    mutation && baseValue
      ? rollRows(mutation.mutaplasmidTypeId, mutation.attributes, baseValue, lookup)
      : null;

  return (
    <div className="space-y-3 text-xs">
      {mutation && (
        <p className="text-text-dim">
          {t('fittings.mutation.baseIs', { name: nameOf(mutation.baseTypeId) })}
        </p>
      )}
      <div className="flex items-center gap-2">
        <MutaplasmidSelect
          triggerId={pickerId}
          options={options}
          value={mutation?.mutaplasmidTypeId ?? null}
          nameOf={nameOf}
          disabled={baseValue === null}
          onChange={(mutaplasmidTypeId) => {
            if (baseTypeId === null || baseValue === null) return;
            apply({
              baseTypeId,
              mutaplasmidTypeId,
              attributes: startingRolls(mutaplasmidTypeId, baseValue, lookup),
            });
          }}
        />
        {mutation && (
          <Button
            size="sm"
            onClick={() => {
              apply(null);
              focusPicker();
            }}
          >
            {t('fittings.mutation.remove')}
          </Button>
        )}
      </div>
      {baseFailed && <WarnNote>{t('fittings.mutation.baseValuesFailed')}</WarnNote>}
      {status === 'rollsUnknown' && <WarnNote>{t('fittings.mutation.rollsUnknownNote')}</WarnNote>}
      {mutation &&
        !baseFailed &&
        (rows === null || dictionary === null ? (
          <p className="text-text-dim">{t('fittings.mutation.loading')}</p>
        ) : (
          <ul className="space-y-3" aria-label={t('fittings.mutation.rollsLabel')}>
            {rows.map((row) => (
              <RollSlider
                key={row.attributeId}
                row={row}
                name={
                  dictionary[row.attributeId]?.name ??
                  lookup.attributeName(row.attributeId) ??
                  `#${row.attributeId}`
                }
                format={(value) => {
                  const entry = dictionary[row.attributeId];
                  return entry ? attributeValueText(value, entry) : formatAttributeNumber(value);
                }}
                onChange={(value) =>
                  baseValue &&
                  edit(
                    (f) =>
                      setModuleRoll(f, slot, slotIndex, row.attributeId, value, baseValue, lookup),
                    `mutation-${slot}-${slotIndex}-${row.attributeId}`
                  )
                }
              />
            ))}
          </ul>
        ))}
      {fromAssets}
    </div>
  );
}

function WarnNote({ children }: { children: ReactNode }) {
  return (
    <p className="flex gap-1.5 text-warning">
      <Icon.Warn aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      {children}
    </p>
  );
}

function MutaplasmidSelect({
  triggerId,
  options,
  value,
  nameOf,
  disabled,
  placeholder,
  onChange,
}: {
  triggerId?: string;
  options: readonly Mutaplasmid[];
  value: number | null;
  nameOf: (typeId: number) => string;
  disabled?: boolean;
  /** What the empty picker asks; "Apply a mutaplasmid" by default. */
  placeholder?: string;
  onChange: (mutaplasmidTypeId: number) => void;
}) {
  const { t } = useTranslation();
  if (options.length === 0) {
    return <p className="text-text-dim">{t('fittings.mutation.noMutaplasmids')}</p>;
  }
  const groups = groupMutaplasmidsByStrain(
    options.map((m) => m.typeId),
    nameOf
  );
  return (
    <Select
      value={value === null ? '' : String(value)}
      onValueChange={(next) => onChange(Number(next))}
      disabled={disabled}
    >
      <SelectTrigger
        id={triggerId}
        size="sm"
        className="w-full max-w-md"
        aria-label={t('fittings.mutation.mutaplasmid')}
      >
        <SelectValue placeholder={placeholder ?? t('fittings.mutation.pickMutaplasmid')} />
      </SelectTrigger>
      <SelectContent>
        {groups.map((group) => (
          <SelectGroup key={group.strain}>
            <SelectLabel>{t(`fittings.mutation.strain.${group.strain}`)}</SelectLabel>
            {group.typeIds.map((typeId) => (
              <SelectItem key={typeId} value={String(typeId)}>
                {nameOf(typeId)}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * For an abyssal module of unknown base: which mutaplasmid made it, then
 * which base it was — every base that mutaplasmid takes becomes the same
 * abyssal type, so the pilot has to say.
 */
function BasePicker({
  resultTypeId,
  lookup,
  nameOf,
  onPick,
}: {
  resultTypeId: number;
  lookup: MutaplasmidLookup;
  nameOf: (typeId: number) => string;
  onPick: (mutaplasmidTypeId: number, baseTypeId: number) => void;
}) {
  const { t } = useTranslation();
  const [mutaplasmidTypeId, setMutaplasmidTypeId] = useState<number | null>(null);
  const bases = [...(lookup.mutaplasmid(mutaplasmidTypeId ?? -1)?.baseTypeIds ?? [])].sort((a, b) =>
    nameOf(a).localeCompare(nameOf(b))
  );
  return (
    <div className="flex flex-wrap gap-2">
      <MutaplasmidSelect
        options={lookup.mutaplasmidsForResult(resultTypeId)}
        value={mutaplasmidTypeId}
        nameOf={nameOf}
        placeholder={t('fittings.mutation.pickMadeBy')}
        onChange={setMutaplasmidTypeId}
      />
      {mutaplasmidTypeId !== null && (
        <Select value="" onValueChange={(next) => onPick(mutaplasmidTypeId, Number(next))}>
          <SelectTrigger
            size="sm"
            className="w-full max-w-md"
            aria-label={t('fittings.mutation.base')}
          >
            <SelectValue placeholder={t('fittings.mutation.pickBase')} />
          </SelectTrigger>
          <SelectContent>
            {bases.map((typeId) => (
              <SelectItem key={typeId} value={String(typeId)}>
                {nameOf(typeId)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

function RollSlider({
  row,
  name,
  format,
  onChange,
}: {
  row: RollRow;
  name: string;
  format: (value: number) => string;
  onChange: (value: number) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const quality = Math.round(row.quality * 100);
  const value = format(row.value);
  const worst = format(row.range.highIsGood ? row.range.min : row.range.max);
  const best = format(row.range.highIsGood ? row.range.max : row.range.min);
  const fixed = row.range.max <= row.range.min;
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-2">
      <label htmlFor={id} className="truncate text-text">
        {name}
      </label>
      <span className="text-right text-text tabular-nums">
        {value}
        <span className="ml-1.5 text-text-dim">
          {row.rolled
            ? t('fittings.mutation.quality', { pct: quality })
            : t('fittings.mutation.baseValue')}
        </span>
      </span>
      <Slider
        id={id}
        className="col-span-2"
        min={0}
        max={STEPS}
        step={1}
        value={Math.round(row.quality * STEPS)}
        disabled={fixed}
        valueText={t('fittings.mutation.valueText', { value, pct: quality })}
        onChange={(event) => onChange(rollAtQuality(Number(event.target.value) / STEPS, row.range))}
      />
      <span className="col-span-2 flex justify-between gap-2 text-text-dim tabular-nums">
        <span>{t('fittings.mutation.worst', { value: worst })}</span>
        <span>{t('fittings.mutation.best', { value: best })}</span>
      </span>
    </li>
  );
}
