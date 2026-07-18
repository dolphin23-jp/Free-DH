import { createStore, type StoreApi } from 'zustand/vanilla'

export const SETTINGS_STORAGE_KEY = 'free-dh:presentation-settings:v1'

export interface SettingsStorage {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

export interface PresentationSettings {
  volume: number
  muted: boolean
  reducedEffects: boolean
}

export interface SettingsActions {
  setVolume: (volume: number) => void
  setMuted: (muted: boolean) => void
  setReducedEffects: (reducedEffects: boolean) => void
  resetSettings: () => void
}

export type SettingsStoreState = PresentationSettings & SettingsActions

export const DEFAULT_PRESENTATION_SETTINGS: PresentationSettings = {
  volume: 0.8,
  muted: false,
  reducedEffects: false,
}

function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_PRESENTATION_SETTINGS.volume
  return Math.max(0, Math.min(1, value))
}

export function normalizePresentationSettings(value: unknown): PresentationSettings {
  if (typeof value !== 'object' || value === null) {
    return { ...DEFAULT_PRESENTATION_SETTINGS }
  }
  const candidate = value as Partial<PresentationSettings>
  return {
    volume:
      typeof candidate.volume === 'number'
        ? clampVolume(candidate.volume)
        : DEFAULT_PRESENTATION_SETTINGS.volume,
    muted:
      typeof candidate.muted === 'boolean'
        ? candidate.muted
        : DEFAULT_PRESENTATION_SETTINGS.muted,
    reducedEffects:
      typeof candidate.reducedEffects === 'boolean'
        ? candidate.reducedEffects
        : DEFAULT_PRESENTATION_SETTINGS.reducedEffects,
  }
}

function getBrowserStorage(): SettingsStorage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}

export function createSettingsStore(storage?: SettingsStorage): StoreApi<SettingsStoreState> {
  let initial = { ...DEFAULT_PRESENTATION_SETTINGS }
  if (storage !== undefined) {
    try {
      const raw = storage.getItem(SETTINGS_STORAGE_KEY)
      if (raw !== null) initial = normalizePresentationSettings(JSON.parse(raw))
    } catch {
      initial = { ...DEFAULT_PRESENTATION_SETTINGS }
    }
  }

  const store = createStore<SettingsStoreState>()((set) => ({
    ...initial,
    setVolume: (volume) => set({ volume: clampVolume(volume) }),
    setMuted: (muted) => set({ muted }),
    setReducedEffects: (reducedEffects) => set({ reducedEffects }),
    resetSettings: () => set({ ...DEFAULT_PRESENTATION_SETTINGS }),
  }))

  if (storage !== undefined) {
    store.subscribe((state) => {
      try {
        storage.setItem(
          SETTINGS_STORAGE_KEY,
          JSON.stringify({
            volume: state.volume,
            muted: state.muted,
            reducedEffects: state.reducedEffects,
          } satisfies PresentationSettings),
        )
      } catch {
        // Presentation settings are best-effort and must never block play.
      }
    })
  }

  return store
}

export const settingsStore = createSettingsStore(getBrowserStorage())
