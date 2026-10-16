/**
 * Marks an action that cannot work without a connection (DESIGN.md §6c,
 * "Needs a connection"). While the browser is online the child renders as it
 * is; while it is offline the child gets `offline = true` and is wrapped in a
 * "Needs a connection" tooltip. The child is expected to set `aria-disabled`
 * (not `disabled`, which would swallow the tooltip) when told it is offline.
 *
 * Only for actions that reach a server. An offline-capable local action never
 * goes through this.
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@/components/ui';
import { useOnline } from '@/stores/network';

export function NeedsConnection({
  children,
}: {
  children: (offline: boolean) => ReactElement<{ className?: string }>;
}) {
  const { t } = useTranslation();
  const online = useOnline();
  if (online) return children(false);
  return <Tooltip content={t('common.needsConnection')}>{children(true)}</Tooltip>;
}
