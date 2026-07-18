import { useMemo, useState } from 'react'
import { useStore } from 'zustand'

import { gameConfig, items } from '../data'
import { codexStore } from '../store/codex'
import { metaStore } from '../store/meta'
import {
  exportCurrentGameSaveJson,
  importCurrentGameSaveJson,
} from '../store/persistence'
import { runStore, type RunInventorySnapshot } from '../store/run'

function starterInventory(): RunInventorySnapshot {
  return {
    bag: {
      columns: gameConfig.player.initialBag.columns,
      rows: gameConfig.player.initialBag.rows,
      items: [
        {
          instanceId: 'starter-sword',
          itemId: 'W02',
          affixIds: [],
          rotated: false,
          runDamageBonus: 0,
          position: { row: 0, column: 0 },
        },
        {
          instanceId: 'starter-lid',
          itemId: 'A04',
          affixIds: [],
          rotated: false,
          runDamageBonus: 0,
          position: { row: 0, column: 1 },
        },
        {
          instanceId: 'starter-herb',
          itemId: 'T01',
          affixIds: [],
          rotated: false,
          runDamageBonus: 0,
          position: { row: 1, column: 1 },
        },
        {
          instanceId: 'starter-charm',
          itemId: 'C01',
          affixIds: [],
          rotated: false,
          runDamageBonus: 0,
          position: { row: 2, column: 1 },
        },
      ],
    },
    storage: {
      capacity: gameConfig.player.storageSlots,
      items: [],
    },
  }
}

interface MetaScreenProps {
  onOpenCodex: () => void
}

export function MetaScreen({ onOpenCodex }: MetaScreenProps) {
  const meta = useStore(metaStore)
  const codex = useStore(codexStore)
  const [abyssLevel, setAbyssLevel] = useState(meta.maxUnlockedAbyssLevel)
  const [seed, setSeed] = useState('')
  const [saveJson, setSaveJson] = useState('')
  const [notice, setNotice] = useState('進行状況は自動保存されます。')

  const lockedItems = useMemo(
    () =>
      items.filter(
        (item) =>
          !item.fusionOnly &&
          item.unlockCost > 0 &&
          !meta.unlockedItemIds.includes(item.id),
      ),
    [meta.unlockedItemIds],
  )

  const startRun = () => {
    const selected = Math.min(abyssLevel, meta.maxUnlockedAbyssLevel)
    const runSeed = seed.trim().length > 0 ? seed.trim() : `run-${Date.now()}`
    runStore.getState().startRun(runSeed, starterInventory(), selected)
  }

  const unlockItem = (itemId: string) => {
    try {
      metaStore.getState().unlockItem(itemId)
      const item = items.find((candidate) => candidate.id === itemId)
      setNotice(`${item?.name ?? itemId}をアンロックしました。`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'アンロックできませんでした。')
    }
  }

  const exportSave = () => {
    setSaveJson(exportCurrentGameSaveJson())
    setNotice('現在のセーブをJSONへ書き出しました。')
  }

  const importSave = () => {
    try {
      importCurrentGameSaveJson(saveJson)
      setAbyssLevel(metaStore.getState().maxUnlockedAbyssLevel)
      setNotice('JSONセーブを読み込みました。')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'JSONを読み込めませんでした。')
    }
  }

  return (
    <main className="app-shell meta-screen">
      <header className="meta-hero">
        <div>
          <p className="eyebrow">Persistent expedition</p>
          <h1>Free-DH</h1>
          <p>魂片で装備を解放し、より深い深淵へ挑みます。</p>
        </div>
        <dl className="meta-summary">
          <div>
            <dt>魂片</dt>
            <dd>{meta.soulFragments}</dd>
          </div>
          <div>
            <dt>深淵</dt>
            <dd>0–{meta.maxUnlockedAbyssLevel}</dd>
          </div>
          <div>
            <dt>図鑑</dt>
            <dd>{codex.discoveredItemIds.length}/{items.length}</dd>
          </div>
        </dl>
      </header>

      <section className="meta-layout">
        <article className="panel expedition-panel">
          <p className="eyebrow">New run</p>
          <h2>遠征を開始</h2>
          <label>
            深淵Lv
            <select
              value={Math.min(abyssLevel, meta.maxUnlockedAbyssLevel)}
              onChange={(event) => setAbyssLevel(Number(event.target.value))}
            >
              {Array.from({ length: meta.maxUnlockedAbyssLevel + 1 }, (_unused, level) => (
                <option key={level} value={level}>Lv {level}</option>
              ))}
            </select>
          </label>
          <label>
            シード（空欄で自動生成）
            <input value={seed} onChange={(event) => setSeed(event.target.value)} />
          </label>
          <p className="muted">
            敵HP +{Math.round(gameConfig.abyss.enemyHpMultiplierPerLevel * abyssLevel * 100)}% /
            攻撃 +{Math.round(gameConfig.abyss.enemyAttackMultiplierPerLevel * abyssLevel * 100)}%
          </p>
          {abyssLevel >= gameConfig.abyss.eliteStartsAtLevel ? (
            <p className="elite-note">各エリアに強化個体が1体出現します。</p>
          ) : null}
          <div className="meta-actions">
            <button type="button" className="result-button" onClick={startRun}>遠征開始</button>
            <button type="button" className="codex-inline-button" onClick={onOpenCodex}>図鑑</button>
          </div>
        </article>

        <article className="panel unlock-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Soul shop</p>
              <h2>アンロック</h2>
            </div>
            <span>{lockedItems.length}件</span>
          </div>
          {lockedItems.length === 0 ? (
            <p className="muted">全ての通常ドロップ装備を解放済みです。</p>
          ) : (
            <div className="unlock-list">
              {lockedItems.map((item) => (
                <article key={item.id} className={`unlock-card rarity-${item.rarity}`}>
                  <div>
                    <span>{item.rarity}</span>
                    <strong>{item.name}</strong>
                    <small>{item.id}</small>
                  </div>
                  <button
                    type="button"
                    onClick={() => unlockItem(item.id)}
                    disabled={meta.soulFragments < item.unlockCost}
                  >
                    {item.unlockCost}魂片
                  </button>
                </article>
              ))}
            </div>
          )}
        </article>

        <article className="panel save-panel">
          <p className="eyebrow">Backup</p>
          <h2>セーブJSON</h2>
          <textarea
            value={saveJson}
            onChange={(event) => setSaveJson(event.target.value)}
            placeholder="ここにセーブJSONを出力、または貼り付けます"
            spellCheck={false}
          />
          <div className="meta-actions">
            <button type="button" className="codex-inline-button" onClick={exportSave}>JSON出力</button>
            <button type="button" className="result-button" onClick={importSave} disabled={saveJson.trim().length === 0}>
              JSON読込
            </button>
          </div>
        </article>
      </section>

      <p className="notice meta-notice" role="status">{notice}</p>
    </main>
  )
}
