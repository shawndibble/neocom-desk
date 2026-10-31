import { useId, type ReactNode, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { IconButton, TextInput, Tooltip } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { useInPlaceEdit } from '@/lib/useInPlaceEdit';
import { PLACE_NICKNAME_MAX, savePlaceNickname } from './placeNicknames';
import { isRenamePlaceState } from './renamePlaceState';

/**
 * The drilled-in station heading: the Place Nickname (else the real name) as
 * the title, the real name dim beneath when nicknamed, and the faint pencil
 * that renames in place, as on Clones. The one place a nickname is edited;
 * clearing the field removes it.
 */
export function StationHeading({
  locationId,
  name,
  nickname,
  headingRef,
  headingClassName,
  children,
}: {
  locationId: number;
  /** The real, resolved place name. */
  name: string;
  nickname: string | undefined;
  headingRef: RefObject<HTMLHeadingElement | null>;
  headingClassName: string;
  /** Inside the heading, after the title (a screen-reader-only item count). */
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const hintId = useId();
  // The row menu's Rename lands here with the field already open.
  const openOnArrival = isRenamePlaceState(useLocation().state);
  const {
    editing,
    start,
    triggerRef: pencilRef,
    inputProps,
  } = useInPlaceEdit({
    initial: () => nickname ?? '',
    open: openOnArrival,
    onCommit: (draft) => savePlaceNickname(locationId, draft),
  });
  if (editing) {
    return (
      <div className="flex min-w-0 flex-col gap-0.5">
        <TextInput
          size="sm"
          {...inputProps}
          maxLength={PLACE_NICKNAME_MAX}
          placeholder={name}
          aria-label={t('assets.placeNickname.field')}
          aria-describedby={hintId}
          className="min-w-0"
        />
        <p id={hintId} className="text-[0.6875rem] text-text-dim">
          {t('assets.placeNickname.hint')}
        </p>
      </div>
    );
  }
  return (
    <>
      <span className="flex min-w-0 items-center gap-1">
        <Tooltip content={nickname !== undefined ? name : undefined}>
          <h2 ref={headingRef} tabIndex={-1} className={headingClassName}>
            {nickname ?? name}
            {children}
          </h2>
        </Tooltip>
        <IconButton
          ref={pencilRef}
          size="row"
          variant="plain"
          icon={<Icon.Rename size={Icon.ICON_SIZE.sm} className="text-text-faint" />}
          label={t('assets.placeNickname.rename', { place: name })}
          tooltip={t('assets.placeNickname.tooltip')}
          onClick={start}
        />
      </span>
      {nickname !== undefined && (
        <span className="truncate text-[0.6875rem] text-text-dim">{name}</span>
      )}
    </>
  );
}
