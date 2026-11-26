import { Tooltip } from '@/components/ui/Tooltip';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { usePlaceNicknames } from './placeNicknames';

export function NicknamedName({
  name,
  nickname,
  className = '',
  truncate = false,
}: {
  name: string;
  nickname: string | undefined;
  className?: string;
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
