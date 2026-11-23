# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Akira291101/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Akira291101/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: it reads one sealed DefiLlama snapshot and ranks every protocol that records no token — 342 pre-token rows — by a modeled implied value built from the snapshot's own figures (TVL, seven-day momentum, age without a token, category and chain breadth, an evidence signal). Every row carries a concrete farm plan with costs and timeframes, the watchlist is covered 40/40, and live-token protocols are kept aside as market reference, never mixed into the ranking.

The dashboard is a static, network-free page: a sortable board with search and category filters, a high-signal filtered view, a detail drawer with the full value arithmetic (base, momentum, maturity, category, signal) and a model curve, plus a methodology panel stating the model constants.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input input/snapshot.json
```

## The model (radar-2)

```
base       = tvl_usd × base_multiple (category-weighted)
momentum   = 1 + tanh-response of change_7d × growth_weight
maturity   = age response over listed_at (age without a token)
category   = infra / restaking / points-driven keyword weights
breadth    = chains count weight
signal     = evidence confidence 0–100 per row
implied    = base × momentum × maturity × category × breadth
```

No protocol name is special-cased anywhere: the same function scores every row. Implied value is a model's claim, not a price target.

---

<sub>Entered on [make.fun](https://make.fun/?ref=azr7e37e&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
