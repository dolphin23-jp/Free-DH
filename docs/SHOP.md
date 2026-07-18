# Shop generation and transactions

T16 adds one shop to every pre-battle loadout phase, including the first battle. The shop identity is the current `runSeed` and zero-based `battleIndex`; moving to the next battle creates a fresh shop.

## Random streams

Each regular listing uses an independent deterministic stream:

```text
runSeed → shop:{battleIndex}:{rerollCount}
```

The initial listing uses `rerollCount = 0`. Each reroll increments the count before generating the next six offers. The area rarity table and abyss shifts are shared with drops, but drop luck and legendary pity do not affect shops. Item selection is weighted, unlocked, and excludes fusion-only items.

T22 shop events use a shop-level stream that does not include the reroll count:

```text
runSeed → shop:{battleIndex}:events
```

This fixes event appearance and the hidden reward for the lifetime of that battle-index shop. Rerolling the normal six offers cannot create, remove, or change a special event.

## Prices and rerolls

Purchase prices, six-slot capacity, reroll costs, sell rate, healing values, and special-event values all come from `src/data/config.json`. Rerolls cost 5, 7, 10, 14, then 19G; later rerolls remain at 19G. The sequence resets when the battle index changes.

Purchased regular items are deterministic instances placed into storage with no affixes. A full storage prevents purchasing until the player places or sells an item.

## Special events

The cursed chest and gambler are each checked independently at the configured 10% appearance chance. Both can appear in the same shop, and each can be purchased once.

- The cursed chest costs 50G. Its reward uses the current shop rarity distribution conditioned on epic-or-legendary, then uses the ordinary unlocked weighted item pool. The item carries a resolved battle-start maximum-HP penalty of 10 while equipped. The curse is not inserted into the ordinary random affix pool.
- The gambler costs 30G. Common, uncommon, rare, epic, and legendary each occupy the configured equal 20% probability, followed by weighted selection from unlocked non-fusion items of that rarity.

Rewards stay hidden in the UI until purchase. Purchasing reveals and registers the item in the codex. Event-use flags are saved, survive reload and reroll, and reset when the battle index changes.

## Selling

Selling uses the rarity purchase price multiplied by the configured sell rate, rounded down. `sellOverride` replaces that base amount. Active `sellBonus` passives in the combat bag are then summed and applied before the final round-down, so Merchant Scale affects all sales, including overridden prices.

## Healing

The healing service can be used once per shop. It deducts the configured cost and restores the configured amount without exceeding maximum HP. Rerolling does not restore the service; entering the next battle-index shop does.

## Provisional boundaries

The source documents do not specify the behavior after the fifth reroll cost, whether ordinary shop items receive affixes, the destination of a purchased item, the rounding order for `sellOverride` and Merchant Scale, the epic-versus-legendary split inside the cursed chest, whether both special events may coexist, or whether rerolls repeat event checks.

T16 uses the smallest-impact rules: later rerolls stay at 19G, shop purchases have no affixes and enter storage, and the complete sale multiplier is rounded down once at the end. T22 conditions the existing shop rarity distribution on epic-or-better, permits independent coexistence, and fixes events per battle-index shop. These decisions are also recorded in `docs/SPEC_TODO_T22.md`.
