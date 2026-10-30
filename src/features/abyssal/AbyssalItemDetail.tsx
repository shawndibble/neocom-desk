/**
 * Item Detail's section for Abyssal types and Mutaplasmids
 * (GLOSSARY.md **Abyssal type**, **Mutaplasmid**, **Roll**). An abyssal
 * type's baked typeInfo shard carries almost none of the attributes a pilot
 * opens it for, because they come from the base module and the roll, so this
 * section states them from the mutaplasmid data (`mutaplasmidDisplay.ts`)
 * and the base module's own shard:
 *
 * - An abyssal type: which base modules and mutaplasmids make it, and what
 *   each mutaplasmid can roll on a chosen base, in absolute values.
 * - One Mutated module (opened with its item id): its own
 *   rolls against its base, with roll quality.
 * - A mutaplasmid: which modules it applies to, what it makes, and its rolls
 *   as ±% of the base value.
 *
 * Every other type renders nothing here.
 */
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { createNumberFormat } from '@/lib/numberLocale';
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { DataTable, NativeSelect, Spinner, type DataTableColumn } from '@/components/ui';
import { ItemInfoLink } from '@/features/entities';
import type { Mutaplasmid, MutaplasmidLookup } from '@/engine/fittings/mutaplasmids';
import {
  defaultBaseTypeId,
  multiplierPercentRows,
  mutaplasmidsMaking,
  rolledAttributeRows,
  strainRangeRows,
  type DisplayRange,
  type RolledAttributeRow,
  type StrainRangeRow,
} from '@/engine/fittings/mutaplasmidDisplay';
import type { ItemMutation } from '@/engine/fittings/types';
import { shortCompareLabels } from '@/engine/market/compareLabels';
import type { AttributeDictionary } from '@/sde/marketTypes';
import { loadTypeNames } from '@/features/character/typeNames';
import { loadTypeDetail } from '@/features/skills/typeDetail';
import { formatAttributeValue } from '@/features/market/format';
import { useAttributeDictionary } from '@/features/fittings/useAttributeDictionary';
import { groupMutaplasmidsByStrain } from '@/engine/fittings/mutationEdit';
import { useMutaplasmidLookup } from './mutaplasmidData';
import { mutationFromRecord } from './dynamicItems';
import type { DynamicItemState } from './useDynamicItem';

const SECTION_HEADING = `border-b border-line pb-1 ${eyebrowClassName}`;

const PERCENT = createNumberFormat({
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
});

type Names = ReadonlyMap<number, string>;

/** Names for `typeIds`, null while loading; a failed load leaves every id on its fallback. */
function useTypeNames(typeIds: readonly number[]): Names | null {
  const key = typeIds.join(',');
  const [answer, setAnswer] = useState<{ key: string; names: Names } | null>(null);
  useEffect(() => {
    let live = true;
    const ids = key === '' ? [] : key.split(',').map(Number);
    loadTypeNames(ids).then(
      (loaded) => {
        if (live) setAnswer({ key, names: loaded });
      },
      () => {
        if (live) setAnswer({ key, names: new Map() });
      }
    );
    return () => {
      live = false;
    };
  }, [key]);
  return answer?.key === key ? answer.names : null;
}

/** A type's own attribute values (baked shard, else cached ESI); null while loading. */
function useBaseAttributes(typeId: number | null): ReadonlyMap<number, number> | null {
  const [state, setState] = useState<{ typeId: number; values: Map<number, number> } | null>(null);
  useEffect(() => {
    if (typeId === null) return;
    let live = true;
    void loadTypeDetail(typeId).then((detail) => {
      if (!live) return;
      const values = new Map(
        (detail?.dogma_attributes ?? []).map((a) => [a.attribute_id, a.value] as const)
      );
      setState({ typeId, values });
    });
    return () => {
      live = false;
    };
  }, [typeId]);
  return state && state.typeId === typeId ? state.values : null;
}

function nameOf(names: Names | null, typeId: number): string {
  return names?.get(typeId) ?? `Type #${typeId}`;
}

export interface AbyssalItemDetailProps {
  typeId: number;
  /** Set when opened on a Mutated module (`useDynamicItem`). */
  dynamic: DynamicItemState;
}

export function AbyssalItemDetail({ typeId, dynamic }: AbyssalItemDetailProps) {
  const lookup = useMutaplasmidLookup();
  const dictionary = useAttributeDictionary();
  const mutation = useMemo(
    () =>
      lookup && dynamic.status === 'ready'
        ? mutationFromRecord(typeId, dynamic.record, lookup)
        : null,
    [lookup, dynamic, typeId]
  );

  if (!lookup || !dictionary) return null;
  const mutaplasmid = lookup.mutaplasmid(typeId);
  if (mutaplasmid) {
    return <MutaplasmidSection mutaplasmid={mutaplasmid} dictionary={dictionary} lookup={lookup} />;
  }
  if (!lookup.isAbyssalType(typeId)) return null;
  if (dynamic.status === 'loading') return <SectionSpinner />;
  if (mutation) {
    return <OwnedRollsSection mutation={mutation} lookup={lookup} dictionary={dictionary} />;
  }
  return (
    <AbyssalTypeSection
      typeId={typeId}
      lookup={lookup}
      dictionary={dictionary}
      rollsUnreadable={dynamic.status === 'ready' || dynamic.status === 'failed'}
    />
  );
}

function SectionSpinner() {
  const { t } = useTranslation();
  return (
    <div className="flex justify-center py-4">
      <Spinner label={t('common.loading')} />
    </div>
  );
}

/** An inline, wrapping list of Show info links. */
function TypeLinks({ typeIds, names }: { typeIds: readonly number[]; names: Names | null }) {
  return (
    <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
      {typeIds.map((id) => (
        <li key={id}>
          <ItemInfoLink typeId={id} itemName={nameOf(names, id)}>
            {nameOf(names, id)}
          </ItemInfoLink>
        </li>
      ))}
    </ul>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className={SECTION_HEADING}>{title}</h3>
      {children}
    </div>
  );
}

function attributeLabel(
  attributeId: number,
  dictionary: AttributeDictionary,
  lookup: MutaplasmidLookup
): { name: string; unit: string | null } {
  const entry = dictionary[attributeId];
  return {
    name: entry?.name ?? lookup.attributeName(attributeId) ?? `#${attributeId}`,
    unit: entry?.unit ?? null,
  };
}

/** Attribute cell: name, unit, and which way is the better roll — in words, not colour. */
function AttributeCell({
  name,
  unit,
  highIsGood,
  note,
}: {
  name: string;
  unit: string | null;
  highIsGood: boolean;
  note?: string;
}) {
  const { t } = useTranslation();
  return (
    <span className="flex flex-col">
      <span className="text-text">
        {name}
        {unit ? <span className="text-text-dim"> ({unit})</span> : null}
      </span>
      <span className="text-[0.6875rem] text-text-dim">
        {highIsGood
          ? t('market.itemDetail.abyssal.higherIsBetter')
          : t('market.itemDetail.abyssal.lowerIsBetter')}
      </span>
      {note && <span className="text-[0.6875rem] text-text-dim">{note}</span>}
    </span>
  );
}

function RangeText({ range, unit }: { range: DisplayRange | null; unit: string | null }) {
  const { t } = useTranslation();
  if (!range) {
    return (
      <>
        <span aria-hidden="true">—</span>
        <span className="sr-only">{t('market.itemDetail.abyssal.notRolled')}</span>
      </>
    );
  }
  return (
    <>
      {t('market.itemDetail.abyssal.range', {
        low: formatAttributeValue(range.low, unit),
        high: formatAttributeValue(range.high, unit),
      })}
    </>
  );
}

/** Both roll tables' leading columns: the attribute (sticky) and the base module's value. */
function attributeAndBaseColumns<R extends { attributeId: number; base: number }>(
  t: TFunction,
  dictionary: AttributeDictionary,
  lookup: MutaplasmidLookup,
  highIsGood: (row: R) => boolean
): DataTableColumn<R>[] {
  return [
    {
      id: 'attribute',
      header: t('market.itemDetail.abyssal.attributeColumn'),
      stickyStart: true,
      stickyStartOnPanel: true,
      className: 'min-w-36',
      render: (row) => {
        const { name, unit } = attributeLabel(row.attributeId, dictionary, lookup);
        return <AttributeCell name={name} unit={unit} highIsGood={highIsGood(row)} />;
      },
    },
    {
      id: 'base',
      header: t('market.itemDetail.abyssal.baseColumn'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums text-text-dim',
      render: (row) => formatAttributeValue(row.base, dictionary[row.attributeId]?.unit ?? null),
    },
  ];
}

/* ----------------------------------------------------------- abyssal type */

function AbyssalTypeSection({
  typeId,
  lookup,
  dictionary,
  rollsUnreadable,
}: {
  typeId: number;
  lookup: MutaplasmidLookup;
  dictionary: AttributeDictionary;
  /** Opened on a Mutated module whose rolls couldn't be read: say so above the type's ranges. */
  rollsUnreadable: boolean;
}) {
  const { t } = useTranslation();
  const selectId = useId();
  const makers = lookup.mutaplasmidsForResult(typeId);
  const baseIds = useMemo(
    () => [...new Set(makers.flatMap((m) => m.baseTypeIds))].sort((a, b) => a - b),
    [makers]
  );
  const names = useTypeNames(
    useMemo(() => [...baseIds, ...makers.map((m) => m.typeId)], [baseIds, makers])
  );
  const bases = useMemo(
    () =>
      baseIds
        .map((id) => ({ typeId: id, name: nameOf(names, id) }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [baseIds, names]
  );
  const [picked, setPicked] = useState<number | null>(null);
  // Waits for the names: the default base is picked by name.
  const baseTypeId = picked ?? (names ? defaultBaseTypeId(bases) : null);
  const baseAttributes = useBaseAttributes(baseTypeId);
  // In the game's strain order, as the Fittings mutaplasmid picker lists them.
  const inStrainOrder = (ids: number[]) =>
    groupMutaplasmidsByStrain(ids, (id) => nameOf(names, id)).flatMap((g) => g.typeIds);
  const strainIds =
    baseTypeId === null
      ? []
      : inStrainOrder(mutaplasmidsMaking(lookup, typeId, baseTypeId).map((m) => m.typeId));
  // Shortened across every maker, not just this base's, so a strain keeps one label whichever base is picked.
  const makerLabels = shortCompareLabels(makers.map((m) => nameOf(names, m.typeId))).labels;
  const labelOf = (typeId: number) =>
    makerLabels[makers.findIndex((m) => m.typeId === typeId)] ?? nameOf(names, typeId);
  const rows = baseAttributes
    ? strainRangeRows(lookup, strainIds, baseAttributes, (id) => dictionary[id]?.unitId)
    : null;

  const columns: DataTableColumn<StrainRangeRow>[] = [
    ...attributeAndBaseColumns<StrainRangeRow>(t, dictionary, lookup, (row) => row.highIsGood),
    ...strainIds.map((strainId, index): DataTableColumn<StrainRangeRow> => ({
      id: `m${strainId}`,
      header: labelOf(strainId),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      render: (row) => (
        <RangeText
          range={row.ranges[index] ?? null}
          unit={dictionary[row.attributeId]?.unit ?? null}
        />
      ),
    })),
  ];

  const baseName = baseTypeId === null ? '' : nameOf(names, baseTypeId);
  return (
    <div className="space-y-4">
      {rollsUnreadable && (
        <p className="text-xs text-text-dim">{t('market.itemDetail.abyssal.rollsUnreadable')}</p>
      )}
      <Section title={t('market.itemDetail.abyssal.rangesTitle')}>
        {bases.length > 1 && (
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <label htmlFor={selectId} className="text-text-dim">
              {t('market.itemDetail.abyssal.baseModule')}
            </label>
            <NativeSelect
              id={selectId}
              size="sm"
              className="min-w-0 flex-1 basis-56"
              value={baseTypeId ?? ''}
              onChange={(e) => setPicked(Number(e.target.value))}
            >
              {bases.map((b) => (
                <option key={b.typeId} value={b.typeId}>
                  {b.name}
                </option>
              ))}
            </NativeSelect>
          </div>
        )}
        {rows === null ? (
          <SectionSpinner />
        ) : rows.length === 0 ? (
          <p className="mt-1 text-xs text-text-dim">{t('market.itemDetail.abyssal.noRanges')}</p>
        ) : (
          <>
            <p className="mt-2 text-xs text-text-dim">
              {t('market.itemDetail.abyssal.rangesHint', { base: baseName })}
            </p>
            {/* Own sideways scroller (DESIGN.md §4a), or the whole dialog body scrolls on a phone. */}
            <div className="mt-1 overflow-x-auto">
              <DataTable
                label={t('market.itemDetail.abyssal.rangesTableLabel', { base: baseName })}
                columns={columns}
                rows={rows}
                rowKey={(row) => row.attributeId}
                density="compact"
                responsive="table"
              />
            </div>
          </>
        )}
      </Section>
      <Section title={t('market.itemDetail.abyssal.mutatedFrom')}>
        <TypeLinks typeIds={bases.map((b) => b.typeId)} names={names} />
      </Section>
      <Section title={t('market.itemDetail.abyssal.mutaplasmids')}>
        <TypeLinks typeIds={inStrainOrder(makers.map((m) => m.typeId))} names={names} />
      </Section>
    </div>
  );
}

/* ----------------------------------------------------- one mutated module */

function OwnedRollsSection({
  mutation,
  lookup,
  dictionary,
}: {
  mutation: ItemMutation;
  lookup: MutaplasmidLookup;
  dictionary: AttributeDictionary;
}) {
  const { t } = useTranslation();
  const names = useTypeNames(
    useMemo(
      () => [mutation.baseTypeId, mutation.mutaplasmidTypeId],
      [mutation.baseTypeId, mutation.mutaplasmidTypeId]
    )
  );
  const baseAttributes = useBaseAttributes(mutation.baseTypeId);
  const rows = baseAttributes
    ? rolledAttributeRows(mutation, lookup, baseAttributes, (id) => dictionary[id]?.unitId)
    : null;
  const unitOf = (row: RolledAttributeRow) => dictionary[row.attributeId]?.unit ?? null;

  const columns: DataTableColumn<RolledAttributeRow>[] = [
    ...attributeAndBaseColumns<RolledAttributeRow>(
      t,
      dictionary,
      lookup,
      (row) => row.range.highIsGood
    ),
    {
      id: 'rolled',
      header: t('market.itemDetail.abyssal.rolledColumn'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      render: (row) => formatAttributeValue(row.rolled, unitOf(row)),
    },
    {
      id: 'range',
      header: t('market.itemDetail.abyssal.possibleColumn'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums text-text-dim',
      render: (row) => <RangeText range={row.range} unit={unitOf(row)} />,
    },
    {
      id: 'quality',
      header: t('market.itemDetail.abyssal.qualityColumn'),
      headerTooltip: t('market.itemDetail.abyssal.qualityHint'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      render: (row) =>
        t('market.itemDetail.abyssal.quality', { pct: Math.round(row.quality * 100) }),
    },
  ];

  return (
    <Section title={t('market.itemDetail.abyssal.rollsTitle')}>
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-text-dim">{t('market.itemDetail.abyssal.baseModule')}</dt>
        <dd>
          <ItemInfoLink typeId={mutation.baseTypeId} itemName={nameOf(names, mutation.baseTypeId)}>
            {nameOf(names, mutation.baseTypeId)}
          </ItemInfoLink>
        </dd>
        <dt className="text-text-dim">{t('market.itemDetail.abyssal.mutaplasmid')}</dt>
        <dd>
          <ItemInfoLink
            typeId={mutation.mutaplasmidTypeId}
            itemName={nameOf(names, mutation.mutaplasmidTypeId)}
          >
            {nameOf(names, mutation.mutaplasmidTypeId)}
          </ItemInfoLink>
        </dd>
      </dl>
      {rows === null ? (
        <SectionSpinner />
      ) : rows.length === 0 ? (
        <p className="mt-2 text-xs text-text-dim">{t('market.itemDetail.abyssal.noRolls')}</p>
      ) : (
        // Own scroller, as the ranges table: Roll quality sits past a phone's edge.
        <div className="mt-2 overflow-x-auto">
          <DataTable
            label={t('market.itemDetail.abyssal.rollsTitle')}
            columns={columns}
            rows={rows}
            rowKey={(row) => row.attributeId}
            density="compact"
            responsive="table"
          />
        </div>
      )}
    </Section>
  );
}

/* ------------------------------------------------------------ mutaplasmid */

function MutaplasmidSection({
  mutaplasmid,
  lookup,
  dictionary,
}: {
  mutaplasmid: Mutaplasmid;
  lookup: MutaplasmidLookup;
  dictionary: AttributeDictionary;
}) {
  const { t } = useTranslation();
  const names = useTypeNames(
    useMemo(
      () => [mutaplasmid.resultTypeId, ...mutaplasmid.baseTypeIds],
      [mutaplasmid.resultTypeId, mutaplasmid.baseTypeIds]
    )
  );
  const bases = [...mutaplasmid.baseTypeIds].sort((a, b) =>
    nameOf(names, a).localeCompare(nameOf(names, b))
  );
  return (
    <div className="space-y-4">
      <Section title={t('market.itemDetail.abyssal.makes')}>
        <TypeLinks typeIds={[mutaplasmid.resultTypeId]} names={names} />
      </Section>
      <Section title={t('market.itemDetail.abyssal.multipliersTitle')}>
        <p className="mt-1 text-xs text-text-dim">
          {t('market.itemDetail.abyssal.multipliersHint')}
        </p>
        <dl className="mt-1 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-xs">
          {multiplierPercentRows(mutaplasmid, (id) => dictionary[id]?.unitId).map((row) => {
            const { name } = attributeLabel(row.attributeId, dictionary, lookup);
            return (
              <div key={row.attributeId} className="contents">
                <dt>
                  <AttributeCell
                    name={name}
                    unit={null}
                    highIsGood={row.highIsGood}
                    note={
                      row.shownBackwards ? t('market.itemDetail.abyssal.shownBackwards') : undefined
                    }
                  />
                </dt>
                <dd className="text-right whitespace-nowrap text-text tabular-nums">
                  {t('market.itemDetail.abyssal.multiplierRange', {
                    low: `${PERCENT(row.lowPct)}%`,
                    high: `${PERCENT(row.highPct)}%`,
                  })}
                </dd>
              </div>
            );
          })}
        </dl>
      </Section>
      <Section title={t('market.itemDetail.abyssal.appliesTo')}>
        <TypeLinks typeIds={bases} names={names} />
      </Section>
    </div>
  );
}
