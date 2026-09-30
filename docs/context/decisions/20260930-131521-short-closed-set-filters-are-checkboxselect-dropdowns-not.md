# Scope decisions — Short closed-set filters are CheckboxSelect dropdowns, not chip rows

_Recorded 2026-09-30._

- **A multi-choice filter over a short, closed set is a `CheckboxSelect` dropdown, not a row of `FilterChip`s.** This covers BPC Sourcing's Exclude, Source and Space filters, and the market-wide scan's Tier, Category and Blueprint source filters. With three or four chip groups the filter box wrapped onto several lines. The trigger summarises the selection in words (All, None, one name, or "N selected"), and that summary is part of its accessible name. A lone on/off toggle (Hide skill-gated, Corp blueprints) stays a chip.
- **The market-wide scan's title is "What's profitable"**, not "What's profitable to build". The panel sits under Industry, so "to build" was redundant.
- **Build Opportunities' All owned view puts its BPO/BPC and activity toggles behind the `FilterBar` funnel, and drops the BPO/BPC count chips from its header.** The header had grown into a second toolbar. The counts duplicated what the Kind filter shows on demand.
- **Build Opportunities' data age sits beside the Industry page title while the Opportunities tab is open.** The panel header was crowded. The badge describes the blueprint fetch, and it disappears on other tabs, so it does not claim to describe the whole page.
