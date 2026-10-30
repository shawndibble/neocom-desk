import { Tooltip } from '@/components/ui/Tooltip';
import { usePlaceNicknameMap } from './placeNicknames';

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
}: {
  name: string;
  nickname: string | undefined;
  className?: string;
}) {
  if (nickname === undefined) return <span className={className}>{name}</span>;
  return (
    <Tooltip content={name}>
      <span className={`flex min-w-0 flex-col ${className}`}>
        <span className="[overflow-wrap:anywhere]">{nickname}</span>
        <span className="text-xs font-normal text-text-dim [overflow-wrap:anywhere]">{name}</span>
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
  const nickname = usePlaceNicknameMap()[locationId];
  return <NicknamedName name={name} nickname={nickname} className={className} />;
}
