# Combat replay boundary

T14 keeps combat rules in `src/engine/` and treats React as a presentation layer.

## Authoritative flow

1. `selectCurrentCombatSetup` builds the combat input from the run store.
2. `createCombatReplay` runs `createCombatState` and `stepCombat` until termination.
3. Every tick that emits events records the new events together with an engine-owned display snapshot.
4. `BattleView` advances only a playback clock and selects the latest elapsed frame.
5. When playback ends, the final authoritative `CombatState` is converted into a run resolution.

The UI never derives HP, block, revival HP, phase HP, or battle outcome from item/enemy definitions. This is important for phase transitions and future rules that cannot be reconstructed from simple arithmetic in React.

## Playback

- Default speed: `1x`
- Toggle speed: `1x ↔ 2x`
- Damage, healing, block, status, seal, phase, revive, flee, and end events are displayed from the event log.
- HP bars and block badges use the snapshot attached to the currently displayed event-bearing tick.

Multiple events can occur in one deterministic 0.1-second engine tick. They share the exact post-tick display snapshot while retaining their individual event-log order.
