/**
 * Offline services: the board's one untimed kind, on a surface that suits it
 * (issue #566).
 *
 * A `serviceOffline` item is `timing: 'untimed'` — a standing fault with no
 * instant at all. That makes it the one kind the rest of this rework cannot
 * carry: it has no clock to take a "most urgent three" from, so it would sit in
 * a Kind Card in an order that means nothing, and no day to land on, so it
 * cannot appear in the Deadline Strip either.
 *
 * Dropping them was not an option — they render in today's flat board, so
 * omitting them would be a visible regression. So they get a full-width strip
 * of their own, below the cards, and only when there are any: a corporation
 * with every service online gets no panel rather than an empty state about a
 * fault it does not have.
 */
import { useTranslation } from 'react-i18next';
import { Panel } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { structureStateLabel } from './boardSources';
import type { CorpBoardItem } from '@/engine/corp/board';

interface CorpOfflineServicesProps {
  items: readonly CorpBoardItem[];
}

export function CorpOfflineServices({ items }: CorpOfflineServicesProps) {
  const { t } = useTranslation();
  if (items.length === 0) return null;

  return (
    <Panel
      title={t('corp.cards.services')}
      meta={
        <span className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase tabular-nums">
          {t('corp.cards.servicesCount', { count: items.length })}
        </span>
      }
    >
      {/*
        A wrapping list of chips, not rows: with no clock there is nothing to
        sort by and nothing to align, and one line per fault would give a
        three-service outage the vertical weight of a reinforcement timer.
      */}
      <ul className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <li
            key={item.id}
            className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-xs border border-line bg-panel-2 px-2.5 text-xs whitespace-nowrap"
          >
            {/*
              Decorative: the severity's name is the visible text beside it
              (DESIGN.md §5), and `text-warning` matches the engine's own
              severity for an untimed fault.
            */}
            <Icon.Warn
              aria-hidden="true"
              size={Icon.ICON_SIZE.sm}
              className="shrink-0 text-warning"
            />
            <span className="text-text-dim">{item.subject}</span>
            <span>{structureStateLabel(item.detail)}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
