import {
  forwardRef,
  useContext,
  useMemo,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { useCharacters } from './useCharacters';
import { useTranslation } from 'react-i18next';
import { PageHeaderClusterContext } from '@/components/ui/pageHeaderCluster';
import * as Icon from '@/components/ui/icons';
import { ICON_SIZE } from '@/components/ui/icons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu';
import { characterPortraitUrl } from '@/lib/eveImages';
import { Spinner } from '@/components/ui/Spinner';
import { LiveStatus } from '@/components/ui/LiveStatus';
import { Tooltip } from '@/components/ui/Tooltip';
import { cx } from '@/lib/cx';
import { CorporationLogoGlyph } from './CorporationLogoGlyph';
import { characterStack, STACK_MAX_FACES, STACK_MAX_FACES_NARROW } from './characterStack';
import { useIsNarrow } from '@/lib/useIsNarrow';
import {
  fieldBaseClassName,
  controlHeightClassName,
  fieldSizeClassName,
  focusRingClassName,
  interactiveClassName,
} from '@/components/ui/controlStyles';
import { useResolvedCharacterFilter, type CharacterFilterValue } from './characterFilterValue';

export type CharacterScopeChoice = CharacterFilterValue | 'corporation';

export type NamedCorporationChoice = `corp:${number}`;

export type PickerChoice = CharacterScopeChoice | NamedCorporationChoice;

export interface CharacterFilterControlProps<V extends PickerChoice = CharacterFilterValue> {
  activeCharacterId: number | null;
  value: V;
  onChange: (next: V) => void;
  corporation?: boolean;
  hideAll?: boolean;
  size?: 'sm' | 'md';
  variant?: 'icon' | 'field';
  triggerLabel?: string;
  characterCount?: number;
  unreadByCharacter?: readonly { characterId: number; name: string; unread: number }[];
  missingNames?: readonly string[];
  loading?: boolean;
  allCharacterIds?: readonly number[];
  corporations?: readonly { id: number; name: string }[];
  mixed?: boolean;
}

const FACE_BOX = 'size-6 md:size-5 touch:size-6';
const FACE_OVERLAP = '-ml-3 md:-ml-2.5 touch:-ml-3';
const FACE_RING = 'rounded-full ring-2 ring-panel-2';

const triggerBaseClassName =
  `group relative inline-flex shrink-0 items-center rounded-xs border border-line px-1 ` +
  `${interactiveClassName} ${focusRingClassName} ` +
  `bg-panel-2 text-text-dim hover:border-line-bright hover:text-text active:bg-panel`;

export function CharacterFilterControl<V extends PickerChoice = CharacterFilterValue>({
  activeCharacterId,
  value,
  onChange,
  corporation = false,
  hideAll = false,
  size: sizeProp = 'sm',
  variant = 'icon',
  triggerLabel,
  characterCount,
  unreadByCharacter,
  missingNames,
  loading = false,
  allCharacterIds,
  corporations,
  mixed = false,
}: CharacterFilterControlProps<V>) {
  const { t, i18n } = useTranslation();
  const size = useContext(PageHeaderClusterContext) ? 'md' : sizeProp;
  const namedId =
    corporations && typeof value === 'string' && value.startsWith('corp:')
      ? Number(value.slice(5))
      : null;
  const named =
    namedId === null
      ? undefined
      : (corporations?.find((c) => c.id === namedId) ?? { id: namedId, name: String(namedId) });
  const resolved = useResolvedCharacterFilter(
    value === 'corporation' || named !== undefined || mixed
      ? 'current'
      : (value as CharacterFilterValue),
    activeCharacterId
  );
  const characters = useCharacters();
  const roster = useMemo(
    () =>
      [...characters]
        .sort((a, b) => a.addedAt - b.addedAt)
        .map((c) => ({ characterId: c.characterId, name: c.name })),
    [characters]
  );
  const isNarrow = useIsNarrow();
  const isCorporation = !mixed && corporation && value === 'corporation';
  const isNamed = !mixed && named !== undefined;
  const isAll = !mixed && !isCorporation && !isNamed && resolved === 'all';
  const allLabel =
    characterCount === undefined
      ? t('character.filter.allCharacters')
      : t('character.scope.all', { count: characterCount });
  const missingNote =
    missingNames && missingNames.length > 0
      ? t('character.scope.missing', {
          names: new Intl.ListFormat(i18n.language, { type: 'conjunction' }).format(missingNames),
        })
      : null;
  const corporationLabel = t('character.filter.corporation');
  const label = mixed
    ? t('character.filter.mixed')
    : isNamed
      ? named!.name
      : isCorporation
        ? corporationLabel
        : isAll
          ? allLabel
          : t('character.filter.thisCharacter');
  const soloCharacter = characterCount !== undefined && characterCount <= 1;
  const showAll = !hideAll && !(corporation && soloCharacter);
  const showCurrent = activeCharacterId !== null;
  const isPartial = isAll && showAll && missingNote !== null;
  if (!corporation && soloCharacter && variant === 'icon') return null;
  const options = (
    <DropdownMenuContent align="start" className={unreadByCharacter ? 'w-60' : 'w-48'}>
      <DropdownMenuRadioGroup
        value={
          mixed
            ? ''
            : isNamed
              ? `corp:${named!.id}`
              : isCorporation
                ? 'corporation'
                : isAll
                  ? 'all'
                  : 'current'
        }
        onValueChange={(next) => onChange(next as V)}
      >
        {showCurrent && (
          <DropdownMenuRadioItem value="current">
            {t('character.filter.thisCharacter')}
          </DropdownMenuRadioItem>
        )}
        {showAll && <DropdownMenuRadioItem value="all">{allLabel}</DropdownMenuRadioItem>}
        {corporation && (
          <DropdownMenuRadioItem value="corporation">{corporationLabel}</DropdownMenuRadioItem>
        )}
        {corporations && corporations.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{t('character.filter.corporations')}</DropdownMenuLabel>
            {corporations.map((c) => (
              <DropdownMenuRadioItem key={c.id} value={`corp:${c.id}`}>
                {c.name}
              </DropdownMenuRadioItem>
            ))}
          </>
        )}
      </DropdownMenuRadioGroup>
      {mixed && (
        <>
          <DropdownMenuSeparator />
          <p className="px-2 py-1.5 text-xs text-text-dim">{t('character.filter.mixedHint')}</p>
        </>
      )}
      {isPartial && (
        <>
          <DropdownMenuSeparator />
          <p className="px-2 py-1.5 text-xs text-text-dim">{missingNote}</p>
        </>
      )}
      {unreadByCharacter && unreadByCharacter.length > 0 && (
        <>
          <DropdownMenuSeparator />
          <ul className="px-2 py-1.5 text-xs text-text-dim">
            {unreadByCharacter.map((entry) => (
              <li key={entry.characterId} className="truncate">
                {t('character.filter.unreadFor', { name: entry.name, count: entry.unread })}
              </li>
            ))}
          </ul>
        </>
      )}
    </DropdownMenuContent>
  );

  const spinner = (
    <span aria-hidden="true" className="flex">
      <Spinner size="sm" label={t('common.loading')} />
    </span>
  );

  if (variant === 'field') {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={triggerLabel ? `${triggerLabel}: ${label}` : undefined}
            className={`${fieldBaseClassName} ${fieldSizeClassName.md} flex w-full max-w-60 items-center justify-between gap-2 text-left`}
          >
            <span className="min-w-0 truncate">{label}</span>
            <Icon.Expanded
              size={ICON_SIZE.md}
              aria-hidden="true"
              className="shrink-0 text-text-dim"
            />
          </button>
        </DropdownMenuTrigger>
        {options}
      </DropdownMenu>
    );
  }

  const accessibleName = isPartial
    ? t('character.scope.triggerPartial', { label, missing: missingNote })
    : mixed
      ? t('character.scope.triggerPartial', { label, missing: t('character.filter.mixedHint') })
      : label;
  const maxFaces = isNarrow ? STACK_MAX_FACES_NARROW : STACK_MAX_FACES;
  const stack = isAll
    ? characterStack(roster, activeCharacterId, missingNames, maxFaces, allCharacterIds)
    : null;
  const nameOf = (id: number) => roster.find((c) => c.characterId === id)?.name;
  const expectedCount = allCharacterIds?.length ?? characterCount ?? 0;
  const placeholderCount = Math.min(expectedCount, maxFaces);
  const extraChip = (extra: number) => (
    <span
      data-stack-extra
      className={cx(
        FACE_BOX,
        FACE_RING,
        FACE_OVERLAP,
        'flex shrink-0 items-center justify-center bg-panel text-[0.6875rem] font-semibold text-text tabular-nums'
      )}
    >
      +{extra}
    </span>
  );
  const faces = isNamed ? (
    <CorporationLogoGlyph
      characterId={null}
      corporationId={named!.id}
      size="sm"
      boxClassName={FACE_BOX}
    />
  ) : mixed ? (
    <Icon.AllCharacters size={ICON_SIZE.md} />
  ) : isCorporation ? (
    <CorporationLogoGlyph characterId={activeCharacterId} size="sm" boxClassName={FACE_BOX} />
  ) : stack && stack.faces.length > 0 ? (
    <>
      {stack.faces.map((id, index) => (
        <Face
          key={id}
          characterId={id}
          className={cx(index > 0 && FACE_OVERLAP)}
          fallback={<Initial name={nameOf(id)} className={cx(index > 0 && FACE_OVERLAP)} />}
        />
      ))}
      {stack.extra > 0 && extraChip(stack.extra)}
    </>
  ) : isAll && placeholderCount > 0 ? (
    <>
      {Array.from({ length: placeholderCount }, (_, index) => (
        <Initial key={index} data-stack-placeholder className={cx(index > 0 && FACE_OVERLAP)} />
      ))}
      {expectedCount > maxFaces && extraChip(expectedCount - maxFaces)}
    </>
  ) : isAll || activeCharacterId === null ? (
    <Icon.AllCharacters size={ICON_SIZE.md} />
  ) : (
    <Face
      characterId={activeCharacterId}
      fallback={<Icon.AllCharacters size={ICON_SIZE.md} data-face-fallback />}
    />
  );

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <StackTrigger
            tooltip={accessibleName}
            aria-label={accessibleName}
            aria-busy={loading || undefined}
            className={`${controlHeightClassName[size]} ${triggerBaseClassName}`}
          >
            <span className="relative flex items-center">
              <span aria-hidden="true" className={cx('flex items-center', loading && 'invisible')}>
                {faces}
              </span>
              {loading && (
                <span className="absolute inset-0 flex items-center justify-center">{spinner}</span>
              )}
            </span>
            <Icon.Expanded aria-hidden="true" className="size-3 shrink-0" />
            {mixed && (
              <span
                data-mixed-dot
                aria-hidden="true"
                className="absolute top-0.5 right-0.5 size-2 rounded-full bg-text-dim ring-2 ring-panel-2 group-active:ring-panel"
              />
            )}
            {isPartial && (
              <span
                data-partial-dot
                aria-hidden="true"
                className="absolute top-0.5 right-0.5 size-2 rounded-full bg-warning ring-2 ring-panel-2 group-active:ring-panel"
              />
            )}
          </StackTrigger>
        </DropdownMenuTrigger>
        {options}
      </DropdownMenu>
      <LiveStatus announceKey={isPartial ? (missingNote ?? undefined) : undefined}>
        {isPartial ? missingNote : null}
      </LiveStatus>
    </>
  );
}

function Face({
  characterId,
  className,
  fallback,
}: {
  characterId: number;
  className?: string;
  fallback: ReactNode;
}) {
  const src = characterPortraitUrl(characterId, 64);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (failedSrc === src) return fallback;
  return (
    <img
      src={src}
      crossOrigin="anonymous"
      alt=""
      width={24}
      height={24}
      decoding="async"
      onError={() => setFailedSrc(src)}
      className={cx('shrink-0 border border-line bg-panel', FACE_BOX, FACE_RING, className)}
    />
  );
}

function Initial({
  name,
  className,
  ...rest
}: { name?: string; className?: string } & Record<`data-${string}`, boolean>) {
  return (
    <span
      {...rest}
      className={cx(
        'flex shrink-0 items-center justify-center border border-line bg-panel text-[0.6875rem] font-semibold text-text-dim uppercase',
        FACE_BOX,
        FACE_RING,
        className
      )}
    >
      {name?.charAt(0)}
    </span>
  );
}

const StackTrigger = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { tooltip: string }
>(function StackTrigger({ tooltip, children, className, ...props }, ref) {
  return (
    <Tooltip content={tooltip}>
      <button ref={ref} type="button" className={cx(focusRingClassName, className)} {...props}>
        {children}
      </button>
    </Tooltip>
  );
});
