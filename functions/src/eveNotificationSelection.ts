// Which ESI notifications are pushable (issue #3756, ADR 0020). Pure: no fetch,
// no Firestore. The poller feeds it one Character's feed plus that Character's
// grant state and the registered devices; it returns the pushes per device and
// the grant state to store.

/** One entry of `GET /characters/{id}/notifications/`; only the fields we use. */
export interface EsiNotification {
  notification_id: number;
  type: string;
  timestamp: string;
  text?: string;
}

export interface DeviceTypes {
  deviceId: string;
  /** ESI types this device enabled for the browser channel for this Character. */
  eveTypes: readonly string[];
}

export interface SelectionInput {
  notifications: readonly EsiNotification[];
  highWaterId: number | null;
  enabledAt: number;
  seenTypes: readonly string[];
  devices: readonly DeviceTypes[];
}

export interface SelectionResult {
  /** Pushable notifications per device, oldest first. Devices with none are omitted. */
  byDevice: Map<string, EsiNotification[]>;
  highWaterId: number | null;
  seenTypes: string[];
}

export function selectPushable(input: SelectionInput): SelectionResult {
  const ordered = [...input.notifications].sort((a, b) => a.notification_id - b.notification_id);
  const seen = new Set(input.seenTypes);
  const byDevice = new Map<string, EsiNotification[]>();
  let highWaterId = input.highWaterId;

  for (const n of ordered) {
    // A type never seen before cannot have been enabled by the user: its first
    // occurrence is recorded, not pushed; its toggle appears next app open.
    const firstSighting = !seen.has(n.type);
    seen.add(n.type);

    const isNew = input.highWaterId === null || n.notification_id > input.highWaterId;
    if (highWaterId === null || n.notification_id > highWaterId) highWaterId = n.notification_id;
    if (!isNew || firstSighting) continue;

    // Enabling alerts never replays history.
    const sentAt = Date.parse(n.timestamp);
    if (!Number.isFinite(sentAt) || sentAt <= input.enabledAt) continue;

    for (const device of input.devices) {
      if (!device.eveTypes.includes(n.type)) continue;
      const list = byDevice.get(device.deviceId);
      if (list) list.push(n);
      else byDevice.set(device.deviceId, [n]);
    }
  }

  return { byDevice, highWaterId, seenTypes: [...seen].sort() };
}
