import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { createNumberFormat } from '@/lib/numberLocale';
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  DataTable,
  NativeSelect,
  ProgressBar,
  Spinner,
  type DataTableColumn,
  type ProgressBarTone,
} from '@/components/ui';
import { ItemInfoLink } from '@/features/entities';
import type { Mutaplasmid, MutaplasmidLookup } from '@/engine/fittings/mutaplasmids';
import {
  defaultBaseTypeId,
  multiplierPercentRows,
  mutaplasmidsMaking,
  rolledAttributeRows,
  rollQualityTone,
  strainRangeRows,
  type DisplayRange,
  type RollQualityTone,
  type RolledAttributeRow,
  type StrainRangeRow,
} from '@/engine/fittings/mutaplasmidDisplay';
import type { ItemMutation } from '@/engine/fittings/types';
import { displayAttributeValue } from '@/engine/fittings/attributeUnits';
import { SkilledValue } from '@/features/market/SkilledValue';
import type { NamedSkilledSource } from '@/features/fittings/useSkilledAttributes';
import { shortCompareLabels } from '@/engine/market/compareLabels';
import type { AttributeDictionary } from '@/sde/marketTypes';
import { loadTypeNames } from '@/features/character/typeNames';
import { loadTypeDetail } from '@/features/skills/typeDetail';
import { formatAttributeValue } from '@/features/market/format';
import { useAttributeDictionary } from '@/features/fittings/useAttributeDictionary';
import { groupMutaplasmidsByStrain } from '@/engine/fittings/mutationEdit';
import { useMutaplasmidLookup } from './mutaplasmidData';
import { useDynamicItemMutation, type DynamicItemState } from './useDynamicItem';

const SECTION_HEADING = `border-b border-line pb-1 ${eyebrowClassName}`;

const PERCENT = createNumberFormat({
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
});

type Names = ReadonlyMap<number, string>;

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

interface SkilledValues {
  values: ReadonlyMap<number, number>;
  sources: ReadonlyMap<number, readonly NamedSkilledSource[]>;
}

export interface AbyssalItemDetailProps {
  typeId: number;
  dynamic: DynamicItemState;
  skilled?: SkilledValues;
}

export function AbyssalItemDetail({ typeId, dynamic, skilled }: AbyssalItemDetailProps) {
  const lookup = useMutaplasmidLookup();
  const dictionary = useAttributeDictionary();
  const mutation = useDynamicItemMutation(typeId, dynamic);

  if (!lookup || !dictionary) return null;
  const mutaplasmid = lookup.mutaplasmid(typeId);
  if (mutaplasmid) {
    return <MutaplasmidSection mutaplasmid={mutaplasmid} dictionary={dictionary} lookup={lookup} />;
  }
  if (!lookup.isAbyssalType(typeId)) return null;
  if (dynamic.status === 'loading') return <SectionSpinner />;
  if (mutation) {
    return (
      <OwnedRollsSection
        mutation={mutation}
        lookup={lookup}
        dictionary={dictionary}
        skilled={skilled}
      />
    );
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

const ROLL_TONE: Readonly<Record<RollQualityTone, { text: string; bar: ProgressBarTone }>> = {
  good: { text: 'text-success', bar: 'success' },
  fair: { text: 'text-warning', bar: 'warning' },
  poor: { text: 'text-danger', bar: 'danger' },
};

function RollQuality({ row, name }: { row: RolledAttributeRow; name: string }) {
  const { t } = useTranslation();
  return (
    <span className="inline-flex items-center justify-end gap-2">
      <ProgressBar
        label={t('market.itemDetail.abyssal.qualityBar', { attribute: name })}
        value={Math.round(row.quality * 100)}
        tone={ROLL_TONE[rollQualityTone(row.quality)].bar}
        size="sm"
        className="w-14"
      />
      <span className="w-9 text-right">
        {t('market.itemDetail.abyssal.quality', { pct: Math.round(row.quality * 100) })}
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
        low: formatAttributeValue(range.low, unit),
        high: formatAttributeValue(range.high, unit),
      })}
    </>
  );
}

function attributeColumn<R extends { attributeId: number }>(
  t: TFunction,
  dictionary: AttributeDictionary,
  lookup: MutaplasmidLookup,
  highIsGood: (row: R) => boolean
): DataTableColumn<R> {
  return {
    id: 'attribute',
    header: t('market.itemDetail.abyssal.attributeColumn'),
    stickyStart: true,
    stickyStartOnPanel: true,
    className: 'min-w-36',
    render: (row) => {
      const { name, unit } = attributeLabel(row.attributeId, dictionary, lookup);
      return <AttributeCell name={name} unit={unit} highIsGood={highIsGood(row)} />;
    },
  };
}

function attributeAndBaseColumns<R extends { attributeId: number; base: number }>(
  t: TFunction,
  dictionary: AttributeDictionary,
  lookup: MutaplasmidLookup,
  highIsGood: (row: R) => boolean
): DataTableColumn<R>[] {
  return [
    attributeColumn(t, dictionary, lookup, highIsGood),
    {
      id: 'base',
      header: t('market.itemDetail.abyssal.baseColumn'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums text-text-dim',
      render: (row) => formatAttributeValue(row.base, dictionary[row.attributeId]?.unit ?? null),
    },
  ];
}

function AbyssalTypeSection({
  typeId,
  lookup,
  dictionary,
  rollsUnreadable,
}: {
  typeId: number;
  lookup: MutaplasmidLookup;
  dictionary: AttributeDictionary;
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
  const baseTypeId = picked ?? (names ? defaultBaseTypeId(bases) : null);
  const baseAttributes = useBaseAttributes(baseTypeId);
  const inStrainOrder = (ids: number[]) =>
    groupMutaplasmidsByStrain(ids, (id) => nameOf(names, id)).flatMap((g) => g.typeIds);
  const strainIds =
    baseTypeId === null
      ? []
      : inStrainOrder(mutaplasmidsMaking(lookup, typeId, baseTypeId).map((m) => m.typeId));
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

function OwnedRollsSection({
  mutation,
  lookup,
  dictionary,
  skilled,
}: {
  mutation: ItemMutation;
  lookup: MutaplasmidLookup;
  dictionary: AttributeDictionary;
  skilled?: SkilledValues;
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
  const skilledText = (row: RolledAttributeRow): string | null => {
    const raw = skilled?.values.get(row.attributeId);
    if (raw === undefined) return null;
    const unit = unitOf(row);
    const { value } = displayAttributeValue(raw, dictionary[row.attributeId]?.unitId, unit);
    const text = formatAttributeValue(value, unit);
    return text === formatAttributeValue(row.rolled, unit) ? null : text;
  };
  const showSkilled = rows?.some((row) => skilledText(row) !== null) ?? false;

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
      cellClassName: (row) => ROLL_TONE[rollQualityTone(row.quality)].text,
      render: (row) => formatAttributeValue(row.rolled, unitOf(row)),
    },
    ...(showSkilled
      ? [
          {
            id: 'skilled',
            header: t('market.itemDetail.abyssal.skilledColumn'),
            headerTooltip: t('market.itemDetail.abyssal.skilledHint'),
            align: 'right' as const,
            className: 'whitespace-nowrap tabular-nums',
            render: (row: RolledAttributeRow) => {
              const text = skilledText(row);
              if (text === null) return '';
              const unit = unitOf(row);
              const label = attributeLabel(row.attributeId, dictionary, lookup).name;
              const shown = unit ? `${text} ${unit}` : text;
              return (
                <SkilledValue
                  skilled={text}
                  spoken={t('market.itemDetail.abyssal.skilledSpoken', { value: shown })}
                  label={label}
                  sources={skilled?.sources.get(row.attributeId) ?? []}
                />
              );
            },
          },
        ]
      : []),
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
      render: (row) => (
        <RollQuality row={row} name={attributeLabel(row.attributeId, dictionary, lookup).name} />
      ),
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
        <div className="mt-2 w-fit max-w-full overflow-x-auto">
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
