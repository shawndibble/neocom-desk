import type { Attributes } from '@/engine/types';
import { RemapMarkerModal } from '../RemapMarkerModal';
import type { useRemapMarkers } from './useRemapMarkers';

/** The manual attribute editor for one Remap Marker, open while `editingMarkerIndex` is set. */
export function RemapMarkerEditor({
  markers,
  baseline,
}: {
  markers: ReturnType<typeof useRemapMarkers>;
  baseline: Attributes;
}) {
  const {
    editingMarkerIndex,
    setEditingMarkerIndex,
    normalizedMarkerAttributes,
    computedMarkerAttributesFor,
    handleSaveMarkerAttributes,
  } = markers;
  return (
    <RemapMarkerModal
      open={editingMarkerIndex !== null}
      onClose={() => setEditingMarkerIndex(null)}
      override={
        editingMarkerIndex === null
          ? null
          : (normalizedMarkerAttributes[editingMarkerIndex] ?? null)
      }
      computed={
        editingMarkerIndex === null ? undefined : computedMarkerAttributesFor(editingMarkerIndex)
      }
      baseline={baseline}
      onSave={(next) => {
        if (editingMarkerIndex !== null) handleSaveMarkerAttributes(editingMarkerIndex, next);
      }}
    />
  );
}
