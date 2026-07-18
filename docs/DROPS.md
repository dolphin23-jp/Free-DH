# Drop generation and treasure flow

T15 inserts a treasure step after every player victory and before the next loadout or final result screen.

## Random stream

Each battle owns one independent stream:

```text
runSeed → drops:{battleIndex}
```

The stream is consumed in slot order for rarity, weighted item selection, optional second-affix chance, and affix selection. Repeating the same request produces the same complete batch.

## Rarity adjustments

The area distribution in `src/data/config.json` is the base. Abyss bonuses, `dropLuck`, and legendary pity move percentage points from common rarity; they never create or destroy total probability.

The pity counter records completed battles with no legendary result. The first 30 missed battles add no bonus. Battle 31 receives +1 percentage point legendary chance, battle 32 receives +2 points, and so on. Any batch containing a legendary resets the counter to zero.

The pity counter and current pending batch are stored under `free-dh:drop-progress:v1`. Keeping the batch with the counter makes repeated renders and browser reloads idempotent.

## Item and affix pools

Default drops include unlocked (`unlockCost === 0`), non-fusion items only. Item selection is weighted by the item data. Rare items receive one affix, epic items receive one or two at the configured 50% chance, and legendary items receive two. Affixes are unique within an item and must match its target.

Claimed drops store both their affix IDs and their resolved combat modifiers/triggers. Maximum-HP affixes are applied as temporary battle-start equipment bonuses and removed from the returned run base HP after combat, preventing repeated accumulation.

## UI ownership

The treasure UI reveals chests sequentially. Each revealed item must be claimed into storage or discarded. The UI does not perform random draws; it only displays the persisted deterministic batch.

Boss expansion kits and the post-boss heal-versus-extra-drops choice remain T18 scope.
