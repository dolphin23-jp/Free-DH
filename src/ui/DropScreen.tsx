import { useEffect, useRef, useState } from 'react'
import { useStore } from 'zustand'

import { playChestOpeningSound, playRaritySound } from '../audio/sounds'
import { affixPool, items } from '../data'
import { resolveAffixEffects } from '../engine/affixes'
import type { DropBatch, DroppedItem } from '../engine/drops'
import { codexStore } from '../store/codex'
import { runStore, type RunInventoryItem } from '../store/run'
import { settingsStore } from '../store/settings'

interface DropScreenProps {
  batch: DropBatch
  onComplete: () => void
}

const itemById = new Map(items.map((item) => [item.id, item]))
const affixById = new Map(affixPool.map((affix) => [affix.id, affix]))

export function dropToInventoryItem(drop: DroppedItem): RunInventoryItem {
  return {
    instanceId: drop.instanceId,
    itemId: drop.itemId,
    affixIds: [...drop.affixIds],
    rotated: false,
    runDamageBonus: 0,
    ...resolveAffixEffects(drop.affixIds),
  }
}

function DropCard({
  drop,
  index,
  opened,
  opening,
  resolved,
  canClaim,
  onOpen,
  onClaim,
  onDiscard,
}: {
  drop: DroppedItem
  index: number
  opened: boolean
  opening: boolean
  resolved: 'claimed' | 'discarded' | undefined
  canClaim: boolean
  onOpen: () => void
  onClaim: () => void
  onDiscard: () => void
}) {
  const item = itemById.get(drop.itemId)
  const affixNames = drop.affixIds.map((id) => affixById.get(id)?.name ?? id)

  if (!opened) {
    return (
      <button
        type="button"
        className={`drop-chest${opening ? ' is-opening' : ''}`}
        onClick={onOpen}
        disabled={opening}
      >
        <span>CHEST {index + 1}</span>
        <strong>{opening ? '開封中…' : 'タップして開封'}</strong>
      </button>
    )
  }

  return (
    <article className={`drop-card rarity-${drop.rarity}${resolved ? ' is-resolved' : ''}`}>
      <span className="drop-card__rarity">{drop.rarity}</span>
      <h2>{item?.name ?? drop.itemId}</h2>
      <p className="drop-card__size">{item?.size.join('×') ?? '?'}マス</p>
      <div className="drop-affixes">
        {affixNames.length === 0 ? (
          <span>アフィックスなし</span>
        ) : (
          affixNames.map((name) => <span key={name}>✦ {name}</span>)
        )}
      </div>
      {resolved === undefined ? (
        <div className="drop-actions">
          <button type="button" onClick={onClaim} disabled={!canClaim}>
            ストレージへ獲得
          </button>
          <button type="button" className="drop-discard" onClick={onDiscard}>
            捨てる
          </button>
        </div>
      ) : (
        <strong className="drop-decision">
          {resolved === 'claimed' ? '獲得済み' : '破棄済み'}
        </strong>
      )}
    </article>
  )
}

export function DropScreen({ batch, onComplete }: DropScreenProps) {
  const state = useStore(runStore)
  const settings = useStore(settingsStore)
  const [openedCount, setOpenedCount] = useState(0)
  const [openingIndex, setOpeningIndex] = useState<number | null>(null)
  const [legendaryReveal, setLegendaryReveal] = useState<string | null>(null)
  const [decisions, setDecisions] = useState<Record<string, 'claimed' | 'discarded'>>({})
  const openingTimer = useRef<number | null>(null)
  const legendaryTimer = useRef<number | null>(null)
  const storageAvailable = state.storage.items.length < state.storage.capacity
  const allOpened = openedCount >= batch.drops.length
  const allResolved = batch.drops.every((drop) => decisions[drop.instanceId] !== undefined)

  useEffect(
    () => () => {
      if (openingTimer.current !== null) window.clearTimeout(openingTimer.current)
      if (legendaryTimer.current !== null) window.clearTimeout(legendaryTimer.current)
    },
    [],
  )

  const revealDrop = (drop: DroppedItem, index: number) => {
    if (index !== openedCount || openingIndex !== null) return
    setOpeningIndex(index)
    playChestOpeningSound()
    openingTimer.current = window.setTimeout(
      () => {
        codexStore.getState().discoverItems([drop.itemId])
        setOpenedCount((current) => current + 1)
        setOpeningIndex(null)
        playRaritySound(drop.rarity)
        if (drop.rarity === 'legendary' && !settings.reducedEffects) {
          setLegendaryReveal(drop.instanceId)
          legendaryTimer.current = window.setTimeout(() => setLegendaryReveal(null), 1100)
        }
      },
      settings.reducedEffects ? 120 : 520,
    )
  }

  const claimDrop = (drop: DroppedItem) => {
    if (decisions[drop.instanceId] !== undefined || !storageAvailable) return
    state.replaceInventory({
      bag: state.bag,
      storage: {
        ...state.storage,
        items: [...state.storage.items, dropToInventoryItem(drop)],
      },
    })
    setDecisions((current) => ({ ...current, [drop.instanceId]: 'claimed' }))
  }

  const discardDrop = (drop: DroppedItem) => {
    if (decisions[drop.instanceId] !== undefined) return
    setDecisions((current) => ({ ...current, [drop.instanceId]: 'discarded' }))
  }

  return (
    <main className="app-shell drop-screen">
      {legendaryReveal !== null ? (
        <div className="legendary-reveal" role="status" aria-live="assertive">
          <span>LEGENDARY</span>
        </div>
      ) : null}

      <header className="drop-header">
        <div>
          <p className="eyebrow">Victory reward</p>
          <h1>Treasure</h1>
        </div>
        <div className="drop-meta">
          <span>AREA {batch.area}</span>
          <span>DROP STREAM {batch.streamSeed}</span>
          <span>PITY {batch.pityBefore} → {batch.pityAfter}</span>
        </div>
      </header>

      <section className="drop-stage" aria-label="戦利品の宝箱">
        {batch.drops.map((drop, index) => (
          <DropCard
            key={drop.instanceId}
            drop={drop}
            index={index}
            opened={index < openedCount}
            opening={openingIndex === index}
            resolved={decisions[drop.instanceId]}
            canClaim={storageAvailable}
            onOpen={() => revealDrop(drop, index)}
            onClaim={() => claimDrop(drop)}
            onDiscard={() => discardDrop(drop)}
          />
        ))}
      </section>

      <aside className="drop-footer">
        <div>
          <strong>ストレージ {state.storage.items.length}/{state.storage.capacity}</strong>
          <span>
            {storageAvailable
              ? '開封した装備を獲得するか、捨てるか選択してください。'
              : 'ストレージが満杯です。不要な戦利品は捨ててください。'}
          </span>
        </div>
        <button type="button" onClick={onComplete} disabled={!allOpened || !allResolved}>
          {allOpened && allResolved ? '次へ進む' : 'すべての宝箱を処理する'}
        </button>
      </aside>
    </main>
  )
}
