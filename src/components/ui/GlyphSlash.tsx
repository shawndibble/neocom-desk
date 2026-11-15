/**
 * A slash drawn over an icon: the mark's "off" state, so colour is never the only signal
 * (§6c). Sits in a `relative` wrapper around the glyph it crosses out.
 */
export function GlyphSlash() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="absolute inset-0 h-full w-full"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    >
      <path d="M2 14 L14 2" />
    </svg>
  );
}
