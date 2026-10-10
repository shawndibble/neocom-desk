/**
 * One scan's node on the volume chart. For the survey's owner (`onRemove`
 * given) it is its own context-menu trigger: right-click, or touch-and-hold,
 * offers "Remove scan". One trigger per node means the menu only replaces the
 * browser's own over a node, and always knows which scan it was opened for.
 * A wider invisible circle makes a finger or a click land on it.
 */
import { useTranslation } from 'react-i18next';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/ContextMenu';
import { formatEveClock } from '@/engine/survey/chatMessage';

interface SurveyScanNodeProps {
  /** Epoch ms of the scan, which also names the node. */
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
