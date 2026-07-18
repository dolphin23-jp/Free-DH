import { useEffect, useState } from 'react'
import { useStore } from 'zustand'

import { syncAudioSettings } from '../audio/sounds'
import { settingsStore } from '../store/settings'

export function SettingsOverlay() {
  const settings = useStore(settingsStore)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    syncAudioSettings(settings.volume, settings.muted)
  }, [settings.volume, settings.muted])

  useEffect(() => {
    document.documentElement.dataset.effects = settings.reducedEffects ? 'reduced' : 'full'
    return () => {
      delete document.documentElement.dataset.effects
    }
  }, [settings.reducedEffects])

  return (
    <aside className={`settings-overlay${open ? ' is-open' : ''}`} aria-label="演出設定">
      <button
        type="button"
        className="settings-toggle"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {open ? '閉じる' : '設定'}
      </button>
      {open ? (
        <div className="settings-panel">
          <div className="settings-heading">
            <div>
              <p className="eyebrow">Presentation</p>
              <h2>演出設定</h2>
            </div>
            <button
              type="button"
              className="settings-mute"
              aria-pressed={settings.muted}
              onClick={() => settings.setMuted(!settings.muted)}
            >
              {settings.muted ? 'ミュート解除' : 'ミュート'}
            </button>
          </div>

          <label className="settings-volume">
            <span>
              音量 <strong>{Math.round(settings.volume * 100)}%</strong>
            </span>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={Math.round(settings.volume * 100)}
              onChange={(event) => settings.setVolume(Number(event.target.value) / 100)}
            />
          </label>

          <label className="settings-check">
            <input
              type="checkbox"
              checked={settings.reducedEffects}
              onChange={(event) => settings.setReducedEffects(event.target.checked)}
            />
            <span>
              <strong>演出を軽減</strong>
              <small>画面シェイク、強い発光、長い開封演出を抑えます。</small>
            </span>
          </label>
        </div>
      ) : null}
    </aside>
  )
}
