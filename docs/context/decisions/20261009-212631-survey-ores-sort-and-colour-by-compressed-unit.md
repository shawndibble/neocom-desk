# Scope decisions — Survey ores sort and colour by compressed unit price

_Recorded 2026-10-09._

- **The Mining Survey orders its ores, and stacks the chart, by the market price of one unit of the ore, dearest first.** The price is the buy price at the pilot's hub in the ore form they chose (compressed by default), and the ore list, the chart layers, the legend, the tooltip and the chat message all use the one order. How much of an ore is in the pasted scans never moves it. This replaces ISK per m³ left, which depended on the raw m³ the scanner prints and on what was left in the paste. Ores at one price go by name. An ore with no market price sorts after every priced ore and is gray.
- **Bar colours follow the same price, between the cheapest and dearest ore on the field.** The dearest ore is always orange and the cheapest always gray, with blue and yellow between at the quarter marks; a lone priced ore is orange. This replaces grading against the richest ore alone, which left a close-priced field with no gray.
