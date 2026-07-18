# Enemy preview and codex progress

T17 adds persistent discovery state without introducing browser persistence ahead of T20.

## Enemy preview

The next-enemy panel reads the current enemy from the run state and the discovery flag from the codex.

- Before the first encounter, the panel shows `???`, the enemy's authored hint, its area, and whether the slot is a boss encounter.
- Pressing **戦闘開始** registers that enemy before the run enters the battle phase.
- Later encounters show the full name, HP or phase HP, reward gold, authored hint, and a short ability summary.

The preview never infers an enemy from its name. It uses the exact enemy ID in the deterministic run order.

## Discovery rules

The codex has three ordered ID lists:

- items: registered when the player sees the complete item identity in owned inventory, a revealed treasure, or a shop listing
- enemies: registered when the player starts that encounter
- recipes: registered through the public `discoverRecipe` action; T19 will call this only after a confirmed fusion

Discovery is permanent within the codex store and is not cleared by ending or resetting a run. Unknown entries render as `?` silhouettes.

## Save boundary

`exportGameSave(runState, codexState)` produces a versioned snapshot containing both:

```text
GameSaveSnapshot
  ├─ run: RunSnapshot
  └─ codex: CodexSnapshot
```

`loadGameSave` validates both halves before mutating either live store. T20 can persist this combined snapshot to localStorage and add JSON import/export without changing the T17 discovery model.

## UI boundary

React displays authored item, enemy, and recipe data and sends explicit discovery actions. It does not calculate combat behavior. The recipe tab supports discovered recipes now, while all recipes naturally remain silhouettes until T19 connects confirmed fusion results.
