# Shop generation and transactions

T16 adds one shop to every pre-battle loadout phase, including the first battle. The shop identity is the current `runSeed` and zero-based `battleIndex`; moving to the next battle creates a fresh shop.

## Random stream

Each listing uses an independent deterministic stream:

```text
runSeed → shop:{battleIndex}:{rerollCount}
```

The initial listing uses `rerollCount = 0`. Each reroll increments the count before generating the next six offers. The area rarity table and abyss shifts are shared with drops, but drop luck and legendary pity do not affect shops. Item selection is weighted, unlocked, and excludes fusion-only items.

## Prices and rerolls

Purchase prices, six-slot capacity, reroll costs, sell rate, and healing values all come from `src/data/config.json`. Rerolls cost 5, 7, 10, 14, then 19G; later rerolls remain at 19G. The sequence resets when the battle index changes.

Purchased items are deterministic instances placed into storage with no affixes. A full storage prevents purchasing until the player places or sells an item.

## Selling

Selling uses the rarity purchase price multiplied by the configured sell rate, rounded down. `sellOverride` replaces that base amount. Active `sellBonus` passives in the combat bag are then summed and applied before the final round-down, so Merchant Scale affects all sales, including overridden prices.

## Healing

The healing service can be used once per shop. It deducts the configured cost and restores the configured amount without exceeding maximum HP. Rerolling does not restore the service; entering the next battle-index shop does.

## Provisional boundaries

The source documents do not specify the behavior after the fifth reroll cost, whether shop items receive affixes, the destination of a purchased item, or the rounding order for `sellOverride` and Merchant Scale. T16 uses the smallest-impact rules: later rerolls stay at 19G, shop purchases have no affixes and enter storage, and the complete sale multiplier is rounded down once at the end. These decisions can be revised without changing the deterministic stream labels.
