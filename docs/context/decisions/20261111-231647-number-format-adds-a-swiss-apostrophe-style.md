# Scope decisions — Number format adds a Swiss apostrophe style

_Recorded 2026-11-11._

- **The Number format setting has a third choice, Swiss (`1'234.56`): an apostrophe groups thousands and a period marks the decimal.** Players in Switzerland and Liechtenstein write it that way. It is a _style_, not a decimal mark: it shares English's period, so `numberLocale` now keeps a `NumberStyle` (`period | comma | apostrophe`) and derives the decimal mark from it. Display follows the browser's `de-CH` grouping character (a straight or typographic apostrophe); typed and pasted numbers accept either.
- **Pasted numbers are unchanged:** they were already read by shape, and an apostrophe was always a thousands mark.
- **Not offered:** space-grouped styles (French, Nordic). A separate ticket if asked.
