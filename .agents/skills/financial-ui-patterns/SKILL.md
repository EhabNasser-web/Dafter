---
name: financial-ui-patterns
description: Use when building any UI that displays prices, P&L, holdings, orders, trades, charts, order books, watchlists, or streaming market data. Covers patterns from Kraken, Coinbase, TradingView, Bloomberg, Robinhood. Read before writing JSX for any financial surface.
---

# Financial UI Patterns

## Overview

Generic AI output for financial UIs fails in predictable ways: raw color values instead of design tokens, jittery non-tabular numbers, no decimal alignment, missing tick-flash on updates, hard-coded dark theme, broken Tailwind dynamic classes, no streaming/staleness states, no accessibility for color-blind users.

This skill codifies the patterns that production trading UIs (Kraken, Coinbase, TradingView, Bloomberg Terminal, Robinhood, Binance) actually ship.

**Core principle:** numbers must be legible, aligned, and trustworthy. Color is a signal, not decoration. Latency must be visible. Every digit shift is a failure.

## Quick Reference

| Concern | Rule |
|---|---|
| Number rendering | Always `tabular-nums`. Never let digits reflow. |
| Number alignment | Right-align in tables. Decimal-align when precision varies. |
| Ticker/ID display | Use `font-mono` (JetBrains Mono, Roboto Mono, IBM Plex Mono). |
| Colors | Semantic tokens only. Never raw color values. |
| Theme | Light + dark via CSS variables. Never hard-code surface colors. |
| P&L sign | Always show `+` for positive returns. `-` is automatic on negatives. |
| Streaming state | Show connecting / live / stale / disconnected explicitly. |
| Accessibility | Pair color with icon, position, or shape. Never color alone. |
| Large numbers | Compact notation for caps/volume, not for prices/balances. |
| Density | Default to compact. 32-40px row height in tables. |

## Core Pattern: Numbers

```tsx
// ❌ BAD: digits shift width on update, color is decorative, no sign on positive
<span className="text-green-500 font-medium">
  {value.toFixed(2)}%
</span>

// ✅ GOOD: tabular-nums locks width, semantic color, explicit sign, fixed width
<span
  className={`tabular-nums font-medium tracking-tight ${
    value >= 0 ? "text-positive" : "text-negative"
  }`}
  style={{ minWidth: 64, textAlign: "right" }}
>
  {value >= 0 ? "+" : ""}{value.toFixed(2)}%
</span>
```

## Common Mistakes

| Mistake | Why it breaks | Fix |
|---|---|---|
| Raw green/red values | Doesn't respect theme | Semantic tokens |
| Numbers without `tabular-nums` | Digits shift width on every update | Always pair `tabular-nums` with updating numbers |
| Hard-coded dark surfaces | Breaks light theme | Use surface tokens from CSS variables |
| `toFixed(2)` for all prices | Wrong for both huge and tiny values | Magnitude-aware precision |
| Color-only gain/loss | 8% of men can't distinguish red/green | Add ▲ ▼ arrows or +/- prefix |
| Centered numbers in tables | Eye can't compare magnitudes | Right-align numbers, left-align labels |

## Verification

Before claiming a financial UI is done, check:

- [ ] Every number has `tabular-nums`
- [ ] Every color is a semantic token
- [ ] Light theme renders correctly
- [ ] Positive returns show `+` prefix
- [ ] Numbers are right-aligned, labels are left-aligned
- [ ] Color is paired with non-color signal (arrow, icon, sign, position)

## Source

Vendored from mdskills.ai (`financial-ui-patterns` by rgourley, MIT).
Full version with references: https://github.com/rgourley/financial-ui-suite
