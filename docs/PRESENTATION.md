# Presentation effects

T21 adds a presentation-only layer around the deterministic game state.

## Audio

- Treasure opening uses Howler.
- Each rarity has a separate short synthesized WAV cue generated in the browser, so the static Vercel build has no sound-file fetch dependency.
- Legendary drops use a longer dedicated cue.
- Global volume and mute are applied through `Howler.volume` and `Howler.mute`.
- Audio starts only from the player's chest-opening gesture, respecting browser autoplay restrictions.

## Motion

- Chest opening has a short anticipation delay before the drop is revealed.
- Legendary drops add a dedicated full-screen flash/title treatment.
- Damage events from the replay log produce floating damage numbers.
- HP damage triggers a brief Web Animations API screen shake. The UI consumes existing replay events and does not recalculate combat.

## Accessibility and performance

Settings are stored independently in `localStorage` under `free-dh:presentation-settings:v1`.

- volume
- mute
- reduced effects

Reduced effects removes the screen shake, shortens chest anticipation, and globally collapses non-essential animation durations. The same CSS fallback is applied when the operating system requests reduced motion. Effects use transforms and opacity where possible to keep mobile compositing inexpensive.
