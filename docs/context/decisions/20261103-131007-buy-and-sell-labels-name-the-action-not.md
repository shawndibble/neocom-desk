# Scope decisions — Buy and sell labels name the action, not the order-book side

_Recorded 2026-11-03._

- **Where a pilot chooses how to buy or sell, labels use Buy now / Buy order / Sell now / Sell order.** A "sell price" was ambiguous: the lowest sell order is what the pilot _pays_, the highest buy order is what they _get_. The four labels name the action and its speed (take what stands, or place yours and wait) and each is at most 10 characters, so table headers do not stretch. Rules out "by order" suffixes, "List" (reads as a noun in the mixed readouts) and bid/ask (finance jargon, and "bid" already means a contract starting bid).
- **Order-book nouns stay.** "Buy orders" and "Sell orders" are EVE's own words wherever the book itself is shown (Market Browser, open orders, contract price checks, notifications).
- **Market-data and billing surfaces keep "buy"/"sell".** Price History, Market Compare and Appraisal show book data or day-close values the pilot cannot act on, and veterans expect Buy/Sell/Split there. Mining, the Corp Tax Book and Buyback keep "Jita buy"/"Jita sell" because the corp bills in those words and "90% of Jita buy" is the community's shared phrase (Mining's value button also composes "Now · {side}", which "Sell now" would collide with).
- **"sell value" becomes "resale value"** for what a pilot's own materials would fetch, so it is not confused with the Sell order price.
