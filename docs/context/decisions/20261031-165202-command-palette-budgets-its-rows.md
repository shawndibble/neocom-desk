# Scope decisions — Command palette budgets its rows

_Recorded 2026-10-31._

- **The palette shows three rows per section while several sections match.** A section opens to all its rows when it is the only match or the pilot arrows into it, and stays open for that query. Each provider still answers with up to six, so a broad word such as "caldari" no longer fills the screen. No "show more" control: keyboard arrowing opens a section, and a touch user narrows by typing (the palette is desktop-first).
- **Sections rank by match quality, not a fixed order.** Exact, then prefix, then word-prefix, then substring-only; ties fall back to provider order. A section still loading or failed keeps its slot so a late arrival never moves rows under the cursor.
- **The section's count sits right-aligned in its header ("6+" at the provider cap).** The "Top 6 shown. Keep typing to narrow." footer is gone; the status region announces the total.
- **Places lists systems by default.** NPC stations only appear for a query of four or more characters that starts the station's name; known structures match any word of their name; a Place Nickname matches at any length. No new prefix syntax.
- **The search field is fixed above the results; only the results scroll,** capped near 60vh.
