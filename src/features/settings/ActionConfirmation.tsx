/** Transient "it worked" note beside the button that produced it (same pattern as the skill planner's tools pane). */
export function ActionConfirmation({ message }: { message: string }) {
  return (
    <p role="status" aria-live="polite" className="text-xs text-success">
      {message}
    </p>
  );
}
