/**
 * The turn-in stories' amber mark: the presentational `PermissionCellMark`,
 * since the views there take every read already made (`GrantCellMark` wires
 * it up in the app).
 */
import { PermissionCellMark } from '@/components/ui';

const noop = () => {};

export function TurnInSampleMark({
  character,
  permission,
  why,
  defaultOpen = false,
}: {
  character: string;
  permission: string;
  why: string;
  defaultOpen?: boolean;
}) {
  return (
    <PermissionCellMark
      status="missing"
      character={character}
      permissions={[permission]}
      why={why}
      onGrant={noop}
      onDismiss={noop}
      settingsLink={<span className="text-accent">Grant missing Permissions</span>}
      defaultOpen={defaultOpen}
    />
  );
}
