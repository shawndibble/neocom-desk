/**
 * Item Detail's section for abyssal (mutated) types and mutaplasmids
 * (GLOSSARY.md **Abyssal type**, **Mutaplasmid**, **Roll**). An abyssal
 * type's baked typeInfo shard carries almost none of the attributes a pilot
 * opens it for, because they come from the base module and the roll, so this
 * section states them from the mutaplasmid data (`mutaplasmidDisplay.ts`)
 * and the base module's own shard:
 *
 * - An abyssal type: which base modules and mutaplasmids make it, and what
 *   each mutaplasmid can roll on a chosen base, in absolute values.
 * - One owned abyssal module (opened with its item id, from Assets): its own
 *   rolls against its base, with roll quality.
 * - A mutaplasmid: which modules it applies to, what it makes, and its rolls
 *   as ±% of the base value.
 *
 * Every other type renders nothing here.
 */
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable, NativeSelect, Spinner, type DataTableColumn } from '@/components/ui';
import { ItemInfoLink } from '@/features/entities';
import {
  mutationFromDynamicItem,
  type Mutaplasmid,
  type MutaplasmidLookup,
} from '@/engine/fittings/mutaplasmids';
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
import { loadAttributeDictionary } from '@/sde/loadMarketSde';
import type { AttributeDictionary } from '@/sde/marketTypes';
import { loadTypeNames } from '@/features/character/typeNames';
import { loadTypeDetail } from '@/features/skills/typeDetail';
import { formatAttributeValue } from '@/features/market/format';
import { useMutaplasmidLookup } from './mutaplasmidData';
import type { DynamicItemState } from './useDynamicItem';

const SECTION_HEADING =
  'border-b border-line pb-1 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase';

const PERCENT = new Intl.NumberFormat('en', {
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
});

type Names = ReadonlyMap<number, string>;

function useAttributeDictionary(): AttributeDictionary | null {
  const [dictionary, setDictionary] = useState<AttributeDictionary | null>(null);
  useEffect(() => {
    let live = true;
    loadAttributeDictionary().then(
      (loaded) => {
        if (live) setDictionary(loaded);
      },
      () => {
        if (live) setDictionary({});
      }
    );
    return () => {
      live = false;
    };
  }, []);
  return dictionary;
}

/** Names for `typeIds`; an id not yet named reads as its fallback until it is. */
function useTypeNames(typeIds: readonly number[]): Names {
  const key = typeIds.join(',');
  const [names, setNames] = useState<Names>(new Map());
  useEffect(() => {
    let live = true;
    const ids = key === '' ? [] : key.split(',').map(Number);
    loadTypeNames(ids).then(
      (loaded) => {
        if (live) setNames(loaded);
      },
      () => {}
    );
    return () => {
      live = false;
    };
  }, [key]);
  return names;
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

function nameOf(names: Names, typeId: number): string {
  return names.get(typeId) ?? `Type #${typeId}`;
}

export interface AbyssalItemDetailProps {
  typeId: number;
  /** The owned item's dynamic item, when Item Detail was opened on one (`useDynamicItem`). */
  dynamic: DynamicItemState;
}

export function AbyssalItemDetail({ typeId, dynamic }: AbyssalItemDetailProps) {
  const lookup = useMutaplasmidLookup();
  const dictionary = useAttributeDictionary();
  const mutation = useMemo(() => {
    if (!lookup || dynamic.status !== 'ready') return null;
    const { record } = dynamic;
    return mutationFromDynamicItem(
      typeId,
      {
        source_type_id: record.sourceTypeId,
        mutator_type_id: record.mutatorTypeId,
        dogma_attributes: record.attributes.map(([attribute_id, value]) => ({
          attribute_id,
          value,
        })),
      },
      lookup
    );
  }, [lookup, dynamic, typeId]);

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
function TypeLinks({ typeIds, names }: { typeIds: readonly number[]; names: Names }) {
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

function figure(value: number, unit: string | null): string {
  return formatAttributeValue(value, unit);
}

/** Attribute cell: name, unit, and which way is the better roll — in words, not colour. */
function AttributeCell({
  name,
  unit,
  highIsGood,
}: {
  name: string;
  unit: string | null;
  highIsGood: boolean;
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
        low: figure(range.low, unit),
        high: figure(range.high, unit),
      })}
    </>
  );
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
  /** Opened on an owned item whose rolls couldn't be read: say so above the type's ranges. */
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
  const baseTypeId = picked ?? (names.size > 0 ? defaultBaseTypeId(bases) : null);
  const baseAttributes = useBaseAttributes(baseTypeId);
  const strains = baseTypeId === null ? [] : mutaplasmidsMaking(lookup, typeId, baseTypeId);
  // Shortened across every maker, not just this base's, so a strain keeps one label whichever base is picked.
  const makerLabels = shortCompareLabels(makers.map((m) => nameOf(names, m.typeId))).labels;
  const labelOf = (typeId: number) =>
    makerLabels[makers.findIndex((m) => m.typeId === typeId)] ?? nameOf(names, typeId);
  const rows = baseAttributes
    ? strainRangeRows(
        lookup,
        strains.map((m) => m.typeId),
        baseAttributes,
        (id) => dictionary[id]?.unitId
      )
    : null;

  const columns: DataTableColumn<StrainRangeRow>[] = [
    {
      id: 'attribute',
      header: t('market.itemDetail.abyssal.attributeColumn'),
      stickyStart: true,
      stickyStartOnPanel: true,
      className: 'min-w-36',
      render: (row) => {
        const { name, unit } = attributeLabel(row.attributeId, dictionary, lookup);
        return <AttributeCell name={name} unit={unit} highIsGood={row.highIsGood} />;
      },
    },
    {
      id: 'base',
      header: t('market.itemDetail.abyssal.baseColumn'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums text-text-dim',
      render: (row) => figure(row.base, dictionary[row.attributeId]?.unit ?? null),
    },
    ...strains.map((m, index): DataTableColumn<StrainRangeRow> => ({
      id: `m${m.typeId}`,
      header: labelOf(m.typeId),
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
            <DataTable
              className="mt-1"
              label={t('market.itemDetail.abyssal.rangesTableLabel', { base: baseName })}
              columns={columns}
              rows={rows}
              rowKey={(row) => row.attributeId}
              density="compact"
              responsive="table"
            />
          </>
        )}
      </Section>
      <Section title={t('market.itemDetail.abyssal.mutatedFrom')}>
        <TypeLinks typeIds={bases.map((b) => b.typeId)} names={names} />
      </Section>
      <Section title={t('market.itemDetail.abyssal.mutaplasmids')}>
        <TypeLinks typeIds={makers.map((m) => m.typeId)} names={names} />
      </Section>
    </div>
  );
}

/* ------------------------------------------------------ one owned module */

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
    {
      id: 'attribute',
      header: t('market.itemDetail.abyssal.attributeColumn'),
      render: (row) => {
        const { name, unit } = attributeLabel(row.attributeId, dictionary, lookup);
        return <AttributeCell name={name} unit={unit} highIsGood={row.range.highIsGood} />;
      },
    },
    {
      id: 'base',
      header: t('market.itemDetail.abyssal.baseColumn'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums text-text-dim',
      render: (row) => figure(row.base, unitOf(row)),
    },
    {
      id: 'rolled',
      header: t('market.itemDetail.abyssal.rolledColumn'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      render: (row) => figure(row.rolled, unitOf(row)),
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
      ) : (
        <DataTable
          className="mt-2"
          label={t('market.itemDetail.abyssal.rollsTitle')}
          columns={columns}
          rows={rows}
          rowKey={(row) => row.attributeId}
          density="compact"
        />
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
          {multiplierPercentRows(mutaplasmid).map((row) => {
            const { name } = attributeLabel(row.attributeId, dictionary, lookup);
            return (
              <div key={row.attributeId} className="contents">
                <dt>
                  <AttributeCell name={name} unit={null} highIsGood={row.highIsGood} />
                </dt>
                <dd className="text-right whitespace-nowrap text-text tabular-nums">
                  {t('market.itemDetail.abyssal.multiplierRange', {
                    low: `${PERCENT.format(row.lowPct)}%`,
                    high: `${PERCENT.format(row.highPct)}%`,
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
