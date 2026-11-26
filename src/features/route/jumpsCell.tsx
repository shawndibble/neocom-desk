import type { TFunction } from 'i18next';
import type { ReactNode } from 'react';
import { HintText } from '@/components/ui/HintText';
import { JumpsLink } from '@/features/route/JumpsLink';
import type { JumpsCellValue } from './currentSystem';

export function renderJumpsCell(
  cell: JumpsCellValue,
  t: TFunction,
  unavailableHintKey: string,
  systemId?: number | null
): ReactNode {
  if (cell.kind === 'loading') return <span className="text-text-dim">…</span>;
  if (cell.kind === 'no-origin') {
    return (
      <HintText content={t('jumpRange.noOrigin')} className="text-text-dim">
        —
      </HintText>
    );
  }
  if (cell.kind === 'unknown') {
    return (
      <HintText content={t('jumpRange.distanceUnavailable')} className="text-text-dim">
        —
      </HintText>
    );
  }
  if (cell.count === null) {
    return (
      <HintText content={t(unavailableHintKey)} className="text-text-dim">
        —
      </HintText>
    );
  }
  return systemId == null ? (
    String(cell.count)
  ) : (
    <JumpsLink
      systemId={systemId}
      label={t('contractSearch.jumpsLinkLabel', { count: cell.count })}
    >
      {cell.count}
    </JumpsLink>
  );
}

export function jumpsCellSortValue(cell: JumpsCellValue): number | undefined {
  return cell.kind === 'value' ? (cell.count ?? undefined) : undefined;
}
