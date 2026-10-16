# Scope decisions — mail link dialog edits link text

_Recorded 2026-10-16._

- **The Link sheet edits the link's visible text as well as its address.** Text (max 200, plain) and Web address (http(s) only) are both fields; a selection, caret or existing link prefill them, and applying replaces the whole range (the whole link when inside one). Rules out a URL-only sheet that wraps the selection, so changing link text no longer means retyping around the link. Source mode uses the same dialog and writes an escaped `<a>` tag; Remove link stays Preview-only.
