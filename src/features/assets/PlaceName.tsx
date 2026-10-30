import { Tooltip } from '@/components/ui/Tooltip';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { usePlaceNicknames } from './placeNicknames';

/**
 * A station or structure name as the Assets page draws it: the pilot's Place
 * Nickname with the real name as a dim second line and in the tooltip, or the
 * real name alone when there is no nickname. Display only: never feed this
 * text to resolution, shares, URLs or plan data.
 */
export function NicknamedName({
  name,
  nickname,
  className = '',
  truncate = false,
}: {
  name: string;
  nickname: string | undefined;
  className?: string;
  /** One line each, ellipsised, for a row that must not grow. */
  truncate?: boolean;
}) {
  if (nickname === undefined)
    return <span className={`${truncate ? 'truncate' : ''} ${className}`}>{name}</span>;
  const wrap = truncate ? 'truncate' : '[overflow-wrap:anywhere]';
  return (
    <Tooltip content={name}>
      <span className={`flex min-w-0 flex-col ${className}`}>
        <span className={wrap}>{nickname}</span>
        <span className={`text-xs font-normal text-text-dim ${wrap}`}>{name}</span>
      </span>
    </Tooltip>
  );
}

/** `NicknamedName` for a place known by id, reading the synced nicknames itself. */
export function PlaceName({
  locationId,
  name,
  className,
}: {
  locationId: number;
  name: string;
  className?: string;
}) {
  useHydratedStore(usePlaceNicknames);
  const nickname = usePlaceNicknames((s) => s.value[locationId]);
  return <NicknamedName name={name} nickname={nickname} className={className} />;
}
