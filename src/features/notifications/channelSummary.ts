import type { SelectionState } from '@/features/assets/assetSelection';
import { NOTIFICATION_CHANNELS, type NotificationChannel } from './eventSelection';

export interface ChannelSummary {
  state: Record<NotificationChannel, SelectionState>;
  differingIds: number[];
  alike: boolean;
}

export function summarizeChannels(
  characterIds: readonly number[],
  read: (characterId: number, channel: NotificationChannel) => boolean
): ChannelSummary {
  const differing = new Set<number>();
  const state = {} as Record<NotificationChannel, SelectionState>;
  for (const channel of NOTIFICATION_CHANNELS) {
    const onIds = characterIds.filter((id) => read(id, channel));
    const offIds = characterIds.filter((id) => !read(id, channel));
    if (offIds.length === 0 && onIds.length > 0) state[channel] = 'checked';
    else if (onIds.length === 0) state[channel] = 'unchecked';
    else {
      state[channel] = 'indeterminate';
      for (const id of onIds.length > offIds.length
        ? offIds
        : offIds.length > onIds.length
          ? onIds
          : offIds) {
        differing.add(id);
      }
    }
  }
  const differingIds = characterIds.filter((id) => differing.has(id));
  return { state, differingIds, alike: differingIds.length === 0 };
}

export function applyToAllFlips(
  characterIds: readonly number[],
  read: (characterId: number, channel: NotificationChannel) => boolean
): Record<NotificationChannel, number[]> {
  const flips = {} as Record<NotificationChannel, number[]>;
  for (const channel of NOTIFICATION_CHANNELS) {
    const onIds = characterIds.filter((id) => read(id, channel));
    const offIds = characterIds.filter((id) => !read(id, channel));
    flips[channel] = onIds.length >= offIds.length ? offIds : onIds;
  }
  return flips;
}
