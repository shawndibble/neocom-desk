/**
 * The one hub picker (issue #6523): a radio menu that says where a page's
 * Trade Hub comes from and changes it. At the top, **Global · <page>**: which
 * one the page uses, and a press switches it (the page's own entry starts at
 * the hub it uses now; Global drops the entry). Below a divider, the hubs, the
 * one in use ticked: a pick writes the page's own entry when it has one, else
 * the Global hub, which moves every page without an entry.
 *
 * A scope press keeps the menu open, since the next thing wanted is usually a
 * hub; a hub press closes it. The trigger is the caller's (DESIGN.md §6c: an
 * accent dashed-underline value inline in a readout, field chrome standing
 * alone), so the menu itself reads the same everywhere.
 */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui';
import { TRADE_HUBS, type TradeHub } from '@/market/hubs';
import { pickHubFor, setHubScope, useHubFor, type HubScope } from './hub';
import type { PageHubArea } from './pageHubs';

export function HubMenu({
  area,
  triggerClassName,
  triggerLabel,
  children,
}: {
  area: PageHubArea;
  triggerClassName?: string;
  /** The trigger's accessible name; it starts with the visible hub (WCAG 2.5.3). */
  triggerLabel: string;
  /** The trigger's visible content, usually the hub's name. */
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const { hubId, scope } = useHubFor(area);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={triggerClassName} aria-label={triggerLabel}>
        {children}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup
          value={scope}
          aria-label={t('pageHubs.scopeLabel')}
          onValueChange={(next) => void setHubScope(area, next as HubScope)}
        >
          <DropdownMenuRadioItem value="global" onSelect={(e) => e.preventDefault()}>
            {t('pageHubs.global')}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="page" onSelect={(e) => e.preventDefault()}>
            {t(`pageHubs.area.${area}`)}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={hubId}
          aria-label={t('pageHubs.hubLabel')}
          onValueChange={(next) => void pickHubFor(area, next as TradeHub['id'])}
        >
          {TRADE_HUBS.map((hub) => (
            <DropdownMenuRadioItem key={hub.id} value={hub.id}>
              {hub.stationLabel}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
