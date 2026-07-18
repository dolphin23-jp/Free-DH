import { describe, expect, it } from 'vitest'

import {
  createSettingsStore,
  DEFAULT_PRESENTATION_SETTINGS,
  SETTINGS_STORAGE_KEY,
  type SettingsStorage,
} from '../src/store/settings'

function memoryStorage(initial?: string): SettingsStorage & { values: Map<string, string> } {
  const values = new Map<string, string>()
  if (initial !== undefined) values.set(SETTINGS_STORAGE_KEY, initial)
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
  }
}

describe('presentation settings', () => {
  it('persists volume, mute, and reduced effects', () => {
    const storage = memoryStorage()
    const first = createSettingsStore(storage)

    first.getState().setVolume(0.35)
    first.getState().setMuted(true)
    first.getState().setReducedEffects(true)

    const restored = createSettingsStore(storage).getState()
    expect(restored.volume).toBe(0.35)
    expect(restored.muted).toBe(true)
    expect(restored.reducedEffects).toBe(true)
  })

  it('clamps volume and keeps mute available at zero volume', () => {
    const store = createSettingsStore()
    store.getState().setVolume(2)
    expect(store.getState().volume).toBe(1)
    store.getState().setVolume(-1)
    expect(store.getState().volume).toBe(0)
    store.getState().setMuted(true)
    expect(store.getState().muted).toBe(true)
  })

  it('falls back to safe defaults for invalid stored data', () => {
    const store = createSettingsStore(memoryStorage('{not-json'))
    expect(store.getState().volume).toBe(DEFAULT_PRESENTATION_SETTINGS.volume)
    expect(store.getState().muted).toBe(false)
    expect(store.getState().reducedEffects).toBe(false)
  })
})
