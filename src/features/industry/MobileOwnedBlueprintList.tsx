/**
 * Phone rendering of Build Opportunities' "All owned" view: one card per
 * blueprint in place of `DataTable`'s stacked label/value rows. The card
 * leads with what identifies the print (icon, name, BPO/BPC badge), shows
 * its research as ME/TE meters, keeps runs and quantity on one line and the
 * location on another, and parks ISK/hour on the right like a price tag.
 *
 * Identical copies (same owner, print, location, ME/TE and runs) fold into
 * one card whose quantity is their sum (`identicalBlueprints.ts`).
 */
import { useTranslation } from 'react-i18next';
import { IskAmount, TypeIcon, sortRows } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { BlueprintBadge } from '@/features/character/assetBrowserRows';
import { iskToneClass } from '@/features/character/format';
import { cx } from '@/lib/cx';
import { useUrlSort } from '@/lib/useUrlState';
import type { BlueprintCatalogEntry } from './blueprintCatalog';
import { groupIdentical, identicalBlueprintKey } from './identicalBlueprints';
import { OWNED_DEFAULT_SORT, OWNED_SORT_KEY } from './opportunitiesUrl';
import {
  OWNED_BLUEPRINT_SORT_VALUE,
  ownedBlueprintOwnerKey,
  ownedBlueprintQuantity,
  type OwnedBlueprintRow,
} from './ownedBlueprints';
import { MobileSortToolbar } from './MobileSortToolbar';
import { StartPlanButton } from './StartPlanButton';
import { isCardOwnClick, useRowStartPlan } from './rowStartPlan';

interface MobileOwnedBlueprintListProps {
  rows: readonly OwnedBlueprintRow[];
  /** Null while the name is still resolving. */
  locationLabel: (row: OwnedBlueprintRow) => string | null;
  /** Only when the rows span more than one owner — the same rule the ranked view uses. */
  showOwner: boolean;
  onStartPlan: (entry: BlueprintCatalogEntry) => Promise<boolean>;
}

type SortFieldId = 'blueprint' | 'iskPerHour' | 'me' | 'te' | 'runs';
const SORT_FIELD_ORDER: readonly SortFieldId[] = ['blueprint', 'iskPerHour', 'me', 'te', 'runs'];

/** ME researches to 10, TE to 20 — each meter is ten segments of its own scale. */
const ME_MAX = 10;
const TE_MAX = 20;
const METER_SEGMENTS = 10;

const identicalRowKey = (row: OwnedBlueprintRow) =>
  identicalBlueprintKey(ownedBlueprintOwnerKey(row), row.blueprint);

/** The badge already says "blueprint", so the card drops the type name's own suffix. */
function shortName(name: string): string {
  return name.replace(/ Blueprint$/, '');
}

function ResearchMeter({ label, value, max }: { label: string; value: number; max: number }) {
  const filled = Math.round((value / max) * METER_SEGMENTS);
  const maxed = value >= max;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span>{label}</span>
      <span aria-hidden="true" className="inline-flex gap-px">
        {Array.from({ length: METER_SEGMENTS }, (_, index) => (
          <span
            key={index}
            className={cx(
              'h-2 w-[3px] rounded-[1px]',
              index < filled ? (maxed ? 'bg-success' : 'bg-accent') : 'bg-line'
            )}
          />
        ))}
      </span>
      <span className="font-semibold text-text">{value}</span>
    </span>
  );
}

export function MobileOwnedBlueprintList({
  rows,
  locationLabel,
  showOwner,
  onStartPlan,
}: MobileOwnedBlueprintListProps) {
  const { t } = useTranslation();
  const unknown = t('common.unknown');
  const startPlanFromRow = useRowStartPlan(onStartPlan);

  const fieldLabel: Record<SortFieldId, string> = {
    blueprint: t('industry.ownedBlueprintsBlueprint'),
    iskPerHour: t('industry.iskPerHour'),
    me: t('industry.ownedBlueprintsMe'),
    te: t('industry.ownedBlueprintsTe'),
    runs: t('industry.runs'),
  };

  const { sort, onSortChange: setSort } = useUrlSort(
    OWNED_SORT_KEY,
    OWNED_DEFAULT_SORT,
    SORT_FIELD_ORDER
  );
  const activeFieldId = sort.columnId as SortFieldId;
  const sortedRows = sortRows(
    rows,
    { sortValue: OWNED_BLUEPRINT_SORT_VALUE[activeFieldId] },
    sort.direction
  );
  const groups = groupIdentical(sortedRows, identicalRowKey);

  return (
    // Flush to the panel's edges: the cards carry their own inset.
    <div className="-mx-3 flex flex-col">
      <MobileSortToolbar
        count={groups.length}
        fields={SORT_FIELD_ORDER.map((id) => ({ id, label: fieldLabel[id] }))}
        sort={sort}
        onSortChange={setSort}
        className="px-3"
      />

      <ul className="flex flex-col" aria-label={t('industry.ownedBlueprintsTitle')}>
        {groups.map(({ first: row, members }) => {
          const name = shortName(row.name);
          const quantity = members.reduce(
            (sum, member) => sum + ownedBlueprintQuantity(member.blueprint),
            0
          );
          const location = locationLabel(row) ?? t('industry.ownedBlueprintsResolvingLocation');
          const owner =
            row.owner.kind === 'character'
              ? row.owner.name
              : t('industry.ownedBlueprintsCorporation');
          const entry = row.catalogEntry;
          return (
            <li
              key={row.id}
              // A tap on the card is Start plan's action; its controls are exempt.
              onClick={(event) => {
                if (entry && isCardOwnClick(event)) startPlanFromRow(entry);
              }}
              className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] gap-x-3 border-b border-line py-3 pr-1 pl-3 last:border-b-0"
            >
              <TypeIcon
                typeId={row.blueprint.type_id}
                size={64}
                width={40}
                height={40}
                className="size-10 rounded-xs border border-line"
              />
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-y-0.5">
                  <span className="text-sm font-semibold break-words">{name}</span>
                  <BlueprintBadge kind={row.kind === 'bpo' ? 'original' : 'copy'} t={t} />
                  {row.activity === 'reaction' && (
                    <span className="ml-1.5 text-[0.6875rem] text-text-dim">
                      {t('industry.ownedBlueprintsActivity.reaction')}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.6875rem] text-text-dim tabular-nums">
                  <ResearchMeter
                    label={t('industry.ownedBlueprintsMe')}
                    value={row.blueprint.material_efficiency}
                    max={ME_MAX}
                  />
                  <ResearchMeter
                    label={t('industry.ownedBlueprintsTe')}
                    value={row.blueprint.time_efficiency}
                    max={TE_MAX}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-x-3 text-[0.6875rem] text-text-dim tabular-nums">
                  <span>
                    {row.kind === 'bpo' ? (
                      t('industry.ownedBlueprintsUnlimitedRunsCount')
                    ) : (
                      <>
                        <span className="font-semibold text-text">{row.blueprint.runs}</span>{' '}
                        {t('industry.ownedBlueprintsRunsSuffix', { count: row.blueprint.runs })}
                      </>
                    )}
                  </span>
                  <span>
                    ×<span className="font-semibold text-text">{quantity}</span>
                  </span>
                  {showOwner && <span>{owner}</span>}
                </div>
                <div className="flex min-w-0 items-center gap-1 text-[0.6875rem] text-text-dim">
                  <Icon.Location aria-hidden="true" size={Icon.ICON_SIZE.sm} className="shrink-0" />
                  <span className="truncate">{location}</span>
                </div>
              </div>
              <div className="flex flex-col items-end justify-between gap-1 text-right">
                <span className="flex flex-col items-end leading-tight tabular-nums">
                  {row.iskPerHour !== null ? (
                    <span className={cx('text-base font-bold', iskToneClass(row.iskPerHour))}>
                      <IskAmount value={row.iskPerHour} decimals={0} />
                    </span>
                  ) : (
                    <span className="text-sm text-text-dim" aria-label={unknown}>
                      —
                    </span>
                  )}
                  <span className="text-[0.6875rem] tracking-widest text-text-dim uppercase">
                    {t('industry.iskPerHour')}
                  </span>
                </span>
                {entry && <StartPlanButton onStart={() => onStartPlan(entry)} compact={{ name }} />}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
