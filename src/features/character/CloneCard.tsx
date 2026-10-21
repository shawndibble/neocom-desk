import { useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton, IskFigureGroup, TextInput, Tooltip } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { type ImplantDetail } from '@/features/character/clones';
import { CLONE_NICKNAME_MAX } from '@/features/character/cloneNicknames';
import { ItemInfoLink } from '@/features/entities';
import { SecurityStatus } from '@/components/SecurityStatus';
import { IskAmount } from '@/components/ui';
import { sumImplantValue } from '@/engine/implantValue';
import { formatDuration } from '@/lib/duration';
import { MIN_JUMP_GAIN_SECONDS, type CloneRow } from '@/engine/clone/cloneVerdict';
import { useInPlaceEdit } from '@/lib/useInPlaceEdit';
import type { AttributeName } from '@/engine/types';

/** 44px tap box on a phone; stacked wrapped links must not overlap, so no negative margins here. */
export const TOUCH_LINK = 'inline-flex min-h-11 items-center md:min-h-0';

/** An implant name linking to Show Info, with its description in a hover/focus tooltip when it has one. */
function ImplantLink({
  typeId,
  name,
  description,
  className,
}: {
  typeId: number;
  name: string;
  description?: string;
  className?: string;
}) {
  const link = (
    <ItemInfoLink typeId={typeId} className={className}>
      {name}
    </ItemInfoLink>
  );
  return description ? <Tooltip content={description}>{link}</Tooltip> : link;
}

export type PriceMap = ReadonlyMap<number, number | null>;

/** Slot order, the way the game lists them; a type with no slot goes last, in ESI's order. */
function bySlot(ids: readonly number[], details: ReadonlyMap<number, ImplantDetail>): number[] {
  // A stable sort; Infinity − Infinity is NaN, which sorts as a tie.
  const slot = (id: number) => details.get(id)?.slot ?? Number.POSITIVE_INFINITY;
  return [...ids].sort((a, b) => slot(a) - slot(b));
}

/** One implant: slot, name (Show info), then what it adds and what it is worth. */
function ImplantRow({
  typeId,
  name,
  detail,
  price,
  showSlot,
}: {
  typeId: number;
  name: string;
  detail: ImplantDetail | undefined;
  /** False when no implant in the list has a known slot: no empty column. */
  showSlot: boolean;
  /** Nullish until priced or when unpriced: the card's footer counts those. */
  price: number | null | undefined;
}) {
  const { t } = useTranslation();
  const bonuses = Object.entries(detail?.bonuses ?? {}) as [AttributeName, number][];
  return (
    <li className="flex items-center gap-2 md:py-0.5">
      {showSlot && (
        <span className="w-4 shrink-0 text-right text-xs text-text-dim tabular-nums">
          {detail?.slot !== undefined && (
            <>
              <span className="sr-only">{t('clones.slot')} </span>
              {detail.slot}
            </>
          )}
        </span>
      )}
      <ImplantLink
        typeId={typeId}
        name={name}
        description={detail?.description}
        className={`${TOUCH_LINK} min-w-0 flex-1 [overflow-wrap:anywhere]`}
      />
      <span className="flex shrink-0 items-center gap-x-2 text-xs whitespace-nowrap text-text-dim tabular-nums">
        {bonuses.map(([attribute, value]) => (
          <span key={attribute}>
            {t('clones.implantBonus', {
              value,
              attribute: t(`clones.verdict.attribute.${attribute}`),
            })}
          </span>
        ))}
        {price != null && price > 0 && <IskAmount value={price} />}
      </span>
    </li>
  );
}

/** The pilot's own name for a clone, edited in place: the heading becomes a field. */
export interface CloneRename {
  /** The pencil's accessible name, which names the clone. */
  label: string;
  /** The pilot's current nickname; empty when there is none. */
  value: string;
  /** Shown in the empty field: what the clone is called without a name. */
  placeholder: string;
  onSave: (name: string) => void;
}

/** One clone's facts: where, how far, what it wears and what that is worth. */
export function CloneCard({
  title,
  place,
  security,
  jumps,
  implantIds,
  implantNames,
  implantDetails,
  prices,
  training,
  rename,
  current = false,
}: {
  title: string;
  /** Under a named clone's title; null when the title already is the place. */
  place: string | null;
  security: number | undefined;
  jumps: ReactNode;
  implantIds: readonly number[];
  implantNames: ReadonlyMap<number, string>;
  implantDetails: ReadonlyMap<number, ImplantDetail>;
  /** Undefined until the price read settles. */
  prices: PriceMap | undefined;
  /** Queue time in this clone; absent when there is no verdict. */
  training?: { row: CloneRow | undefined; best: boolean };
  /** Absent for the worn clone (no jump_clone_id) and until nicknames hydrate. */
  rename?: CloneRename;
  /** The clone the Character is wearing now: set apart from the jump clones. */
  current?: boolean;
}) {
  const { t } = useTranslation();
  const hintId = useId();
  const {
    editing,
    start: startRename,
    triggerRef: pencilRef,
    inputProps,
  } = useInPlaceEdit({
    initial: () => rename?.value ?? '',
    onCommit: (draft) => rename?.onSave(draft),
  });
  const value = prices ? sumImplantValue(implantIds, prices) : null;
  const delta = training?.row?.deltaSeconds ?? null;
  const showSlot = implantIds.some((id) => implantDetails.get(id)?.slot !== undefined);

  return (
    <li
      className={`space-y-1.5 rounded-xs border p-3 text-sm ${
        current ? 'border-accent/60 bg-accent/5 md:col-span-2' : 'border-line bg-panel-2'
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
        {editing && rename ? (
          <TextInput
            size="sm"
            {...inputProps}
            maxLength={CLONE_NICKNAME_MAX}
            placeholder={rename.placeholder}
            aria-label={t('clones.nameField')}
            aria-describedby={hintId}
            className="min-w-0 flex-1"
          />
        ) : (
          <span className="flex min-w-0 items-center gap-1">
            <h3 className="font-semibold [overflow-wrap:anywhere]">{title}</h3>
            {rename && (
              <IconButton
                ref={pencilRef}
                size="row"
                variant="plain"
                icon={<Icon.Rename size={Icon.ICON_SIZE.sm} className="text-text-faint" />}
                label={rename.label}
                tooltip={t('clones.rename')}
                onClick={startRename}
              />
            )}
          </span>
        )}
        {/* Place, security and jumps are one phrase: they wrap together, never apart. */}
        <span className="flex min-w-0 flex-wrap items-center gap-x-2">
          {place !== null && (
            <span className="text-text-dim [overflow-wrap:anywhere]">{place}</span>
          )}
          {security !== undefined && <SecurityStatus security={security} />}
          {jumps}
        </span>
      </div>
      {editing && (
        <p id={hintId} className="text-xs text-text-dim">
          {t('clones.nameHint')}
        </p>
      )}
      {training?.row?.totalSeconds != null && (
        <p className="flex flex-wrap items-center gap-x-2 text-xs">
          <span className="tabular-nums">
            {t('clones.verdict.rowQueue', { duration: formatDuration(training.row.totalSeconds) })}
          </span>
          {delta !== null && Math.abs(delta) >= MIN_JUMP_GAIN_SECONDS && (
            <span className={delta < 0 ? 'text-success' : 'text-text-dim'}>
              {t(delta < 0 ? 'clones.verdict.rowSooner' : 'clones.verdict.rowLonger', {
                duration: formatDuration(Math.abs(delta)),
              })}
            </span>
          )}
          {training.best && (
            <span className="rounded-xs border border-success/60 px-1.5 text-[0.6875rem] font-semibold tracking-wide text-success uppercase">
              {t('clones.verdict.badge')}
            </span>
          )}
        </p>
      )}
      {implantIds.length === 0 ? (
        <p className="text-text-dim">{t('clones.noImplants')}</p>
      ) : (
        // One row per implant, divided: on a phone each row is a 44px tap target,
        // and a wrapped run of 44px links read as gaps, not as a list.
        <IskFigureGroup className="space-y-1.5">
          <ul className="divide-y divide-line border-y border-line">
            {bySlot(implantIds, implantDetails).map((id) => (
              <ImplantRow
                key={id}
                typeId={id}
                name={implantNames.get(id) ?? `Type #${id}`}
                detail={implantDetails.get(id)}
                price={prices?.get(id)}
                showSlot={showSlot}
              />
            ))}
          </ul>
          <p className="flex flex-wrap items-center gap-x-2 text-xs text-text-dim">
            <span>{t('clones.implantCount', { count: implantIds.length })}</span>
            {value && (
              <span>
                {value.unpriced < implantIds.length && <IskAmount value={value.total} />}
                {value.unpriced > 0 && ` ${t('clones.unpriced', { count: value.unpriced })}`}
              </span>
            )}
          </p>
        </IskFigureGroup>
      )}
    </li>
  );
}
