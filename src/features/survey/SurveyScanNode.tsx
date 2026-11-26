import { useTranslation } from 'react-i18next';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/ContextMenu';
import { formatEveClock } from '@/engine/survey/chatMessage';

interface SurveyScanNodeProps {
  at: number;
  cx: number;
  cy: number;
  onRemove?: (at: number) => void;
}

export function SurveyScanNode({ at, cx, cy, onRemove }: SurveyScanNodeProps) {
  const { t } = useTranslation();
  const marks = (
    <>
      <circle r={11} fill="transparent" />
      <circle r={3} fill="var(--color-panel)" stroke="var(--color-text)" strokeWidth={1.5} />
    </>
  );
  const transform = `translate(${cx} ${cy})`;
  if (onRemove === undefined) return <g transform={transform}>{marks}</g>;
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <g transform={transform} aria-label={t('survey.chartNode', { time: formatEveClock(at) })}>
          {marks}
        </g>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => onRemove(at)}>{t('survey.removeScan')}</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
