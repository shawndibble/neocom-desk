import { createColumnVisibilitySetting } from '@/lib/columnVisibility';

export const SHARED_BLUEPRINT_COLUMN_IDS = ['member', 'location', 'jumps', 'meTe', 'runs'] as const;

export type SharedBlueprintColumnId = (typeof SHARED_BLUEPRINT_COLUMN_IDS)[number];

export const useVisibleSharedBlueprintColumns = createColumnVisibilitySetting({
  key: 'sharedBlueprintVisibleColumns',
  ids: SHARED_BLUEPRINT_COLUMN_IDS,
});
