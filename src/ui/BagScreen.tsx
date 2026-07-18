import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { useStore } from 'zustand'

import { getPlacedSize } from '../engine/adjacency'
import {
  canPlaceBagItem,
  getBaseSellPrice,
  getItemDefinition,
  moveBagItem,
  moveBagItemToStorage,
  placeStorageItemInBag,
  removeInventoryItem,
  reorderStorageItem,
  rotateBagItem,
} from '../store/bag'
import {
  runStore,
  type RunBagItem,
  type RunInventoryItem,
  type RunInventorySnapshot,
} from '../store/run'

interface DragData {
  instanceId: string
  source: 'bag' | 'storage'
}

function inventoryItem(instanceId: string, itemId: string): RunInventoryItem {
  return {
    instanceId,
    itemId,
    affixIds: [],
    rotated: false,
    runDamageBonus: 0,
  }
}

function createDemoInventory(): RunInventorySnapshot {
  return {
    bag: {
      columns: 4,
      rows: 3,
      items: [
        { ...inventoryItem('demo-greatsword', 'W06'), position: { row: 0, column: 0 } },
        { ...inventoryItem('demo-dagger', 'W01'), position: { row: 0, column: 2 } },
        { ...inventoryItem('demo-lid', 'A04'), position: { row: 1, column: 2 } },
        { ...inventoryItem('demo-poison', 'T05'), position: { row: 2, column: 2 } },
      ],
    },
    storage: {
      capacity: 8,
      items: [
        inventoryItem('demo-spear', 'W12'),
        inventoryItem('demo-shield', 'A01'),
        inventoryItem('demo-water', 'T07'),
      ],
    },
  }
}

function parseBagCell(id: string): { row: number; column: number } | null {
  const match = /^bag:(\d+):(\d+)$/.exec(id)
  return match === null ? null : { row: Number(match[1]), column: Number(match[2]) }
}

function parseStorageSlot(id: string): number | null {
  const match = /^storage:(\d+)$/.exec(id)
  return match === null ? null : Number(match[1])
}

function ItemFace({ item }: { item: RunInventoryItem }) {
  const definition = getItemDefinition(item.itemId)
  return (
    <>
      <span className="item-card__rarity">{definition.rarity}</span>
      <strong>{definition.name}</strong>
      <span className="item-card__id">{definition.id}</span>
    </>
  )
}

function DraggableItem({
  item,
  source,
  selected,
  style,
  onSelect,
}: {
  item: RunInventoryItem
  source: DragData['source']
  selected: boolean
  style?: CSSProperties
  onSelect: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `item:${item.instanceId}`,
    data: { instanceId: item.instanceId, source } satisfies DragData,
  })
  const dragStyle: CSSProperties = {
    ...style,
    transform:
      transform === null
        ? undefined
        : `translate3d(${transform.x}px, ${transform.y}px, 0)`,
  }

  return (
    <button
      ref={setNodeRef}
      type="button"
      className={`item-card rarity-${getItemDefinition(item.itemId).rarity}${
        selected ? ' is-selected' : ''
      }${isDragging ? ' is-dragging' : ''}`}
      style={dragStyle}
      onClick={onSelect}
      aria-label={`${getItemDefinition(item.itemId).name}を選択してドラッグ`}
      {...listeners}
      {...attributes}
    >
      <ItemFace item={item} />
    </button>
  )
}

function BagCell({ row, column }: { row: number; column: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: `bag:${row}:${column}` })
  return (
    <div
      ref={setNodeRef}
      className={`bag-cell${isOver ? ' is-over' : ''}`}
      aria-label={`カバン ${row + 1}行${column + 1}列`}
    />
  )
}

function StorageSlot({
  index,
  item,
  selected,
  onSelect,
}: {
  index: number
  item?: RunInventoryItem
  selected: boolean
  onSelect: () => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `storage:${index}` })
  return (
    <div ref={setNodeRef} className={`storage-slot${isOver ? ' is-over' : ''}`}>
      <span className="storage-slot__number">{index + 1}</span>
      {item === undefined ? null : (
        <DraggableItem
          item={item}
          source="storage"
          selected={selected}
          onSelect={onSelect}
        />
      )}
    </div>
  )
}

function ActionButton({ children, onClick, disabled = false }: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button type="button" className="action-button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  )
}

export function BagScreen() {
  const state = useStore(runStore)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeDrag, setActiveDrag] = useState<DragData | null>(null)
  const [notice, setNotice] = useState('アイテムをドラッグして配置を組み替えられます。')
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 160, tolerance: 8 } }),
  )

  const inventory = useMemo<RunInventorySnapshot>(
    () => ({ bag: state.bag, storage: state.storage }),
    [state.bag, state.storage],
  )
  const selectedBagItem = state.bag.items.find((item) => item.instanceId === selectedId)
  const selectedStorageItem = state.storage.items.find((item) => item.instanceId === selectedId)
  const selectedItem = selectedBagItem ?? selectedStorageItem
  const activeItem =
    activeDrag === null
      ? undefined
      : [...state.bag.items, ...state.storage.items].find(
          (item) => item.instanceId === activeDrag.instanceId,
        )

  const startDemo = () => {
    state.startRun('t13-demo', createDemoInventory())
    setSelectedId(null)
    setNotice('デモ周回を開始しました。')
  }

  const applyInventory = (next: RunInventorySnapshot, message: string) => {
    state.replaceInventory(next)
    setNotice(message)
  }

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current as DragData | undefined
    if (data !== undefined) setActiveDrag(data)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const data = event.active.data.current as DragData | undefined
    setActiveDrag(null)
    if (data === undefined || event.over === null) return

    const targetId = String(event.over.id)
    const bagCell = parseBagCell(targetId)
    const storageIndex = parseStorageSlot(targetId)

    try {
      if (bagCell !== null) {
        const next =
          data.source === 'bag'
            ? moveBagItem(inventory, data.instanceId, bagCell)
            : placeStorageItemInBag(inventory, data.instanceId, bagCell)
        applyInventory(next, 'カバンの配置を更新しました。')
        return
      }

      if (storageIndex !== null) {
        const next =
          data.source === 'bag'
            ? moveBagItemToStorage(inventory, data.instanceId, storageIndex)
            : reorderStorageItem(inventory, data.instanceId, storageIndex)
        applyInventory(next, 'ストレージを更新しました。')
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '配置を更新できませんでした。')
    }
  }

  const rotateSelected = () => {
    if (selectedBagItem === undefined) return
    try {
      applyInventory(rotateBagItem(inventory, selectedBagItem.instanceId), '回転しました。')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'この位置では回転できません。')
    }
  }

  const storeSelected = () => {
    if (selectedBagItem === undefined) return
    try {
      applyInventory(
        moveBagItemToStorage(inventory, selectedBagItem.instanceId),
        'ストレージへ移動しました。',
      )
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'ストレージへ移動できません。')
    }
  }

  const sellSelected = () => {
    if (selectedItem === undefined) return
    const { inventory: next, item } = removeInventoryItem(inventory, selectedItem.instanceId)
    const price = getBaseSellPrice(item.itemId)
    state.replaceInventory(next)
    runStore.setState((current) => ({ gold: current.gold + price }))
    setSelectedId(null)
    setNotice(`${getItemDefinition(item.itemId).name}を${price}Gで売却しました。`)
  }

  if (state.phase === 'idle') {
    return (
      <main className="app-shell">
        <section className="intro-panel" aria-labelledby="game-title">
          <p className="eyebrow">Backpack-building auto battler</p>
          <h1 id="game-title">Free-DH</h1>
          <p>2×3の大型装備を含むカバンを、ドラッグと回転で組み替えます。</p>
          <ActionButton onClick={startDemo}>カバンUIを開始</ActionButton>
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell bag-screen">
      <header className="game-header">
        <div>
          <p className="eyebrow">Expedition loadout</p>
          <h1>Free-DH</h1>
        </div>
        <dl className="run-stats">
          <div><dt>HP</dt><dd>{state.currentHp}/{state.maxHp}</dd></div>
          <div><dt>Gold</dt><dd>{state.gold}G</dd></div>
          <div><dt>Battle</dt><dd>{state.battleIndex + 1}/15</dd></div>
        </dl>
      </header>

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragCancel={() => setActiveDrag(null)}
        onDragEnd={handleDragEnd}
      >
        <section className="loadout-layout">
          <article className="panel bag-panel">
            <div className="panel-heading">
              <div><p className="eyebrow">Combat build</p><h2>カバン</h2></div>
              <span>{state.bag.columns}×{state.bag.rows}</span>
            </div>
            <div
              className="bag-grid"
              style={{
                gridTemplateColumns: `repeat(${state.bag.columns}, 1fr)`,
                gridTemplateRows: `repeat(${state.bag.rows}, 1fr)`,
              }}
            >
              {Array.from({ length: state.bag.rows }, (_, row) =>
                Array.from({ length: state.bag.columns }, (_unused, column) => (
                  <BagCell key={`${row}:${column}`} row={row} column={column} />
                )),
              )}
              {state.bag.items.map((item) => {
                const size = getPlacedSize({
                  position: item.position,
                  size: getItemDefinition(item.itemId).size,
                  rotated: item.rotated,
                })
                return (
                  <DraggableItem
                    key={item.instanceId}
                    item={item}
                    source="bag"
                    selected={selectedId === item.instanceId}
                    onSelect={() => setSelectedId(item.instanceId)}
                    style={{
                      gridColumn: `${item.position.column + 1} / span ${size.columns}`,
                      gridRow: `${item.position.row + 1} / span ${size.rows}`,
                    }}
                  />
                )
              })}
            </div>
          </article>

          <article className="panel storage-panel">
            <div className="panel-heading">
              <div><p className="eyebrow">Reserve items</p><h2>ストレージ</h2></div>
              <span>{state.storage.items.length}/{state.storage.capacity}</span>
            </div>
            <div className="storage-grid">
              {Array.from({ length: state.storage.capacity }, (_unused, index) => (
                <StorageSlot
                  key={index}
                  index={index}
                  item={state.storage.items[index]}
                  selected={state.storage.items[index]?.instanceId === selectedId}
                  onSelect={() => setSelectedId(state.storage.items[index]?.instanceId ?? null)}
                />
              ))}
            </div>
          </article>

          <aside className="panel inspector-panel">
            <div className="panel-heading"><div><p className="eyebrow">Selected</p><h2>装備操作</h2></div></div>
            {selectedItem === undefined ? (
              <p className="muted">装備を選択すると、回転・保管・売却ができます。</p>
            ) : (
              <>
                <div className={`selected-summary rarity-${getItemDefinition(selectedItem.itemId).rarity}`}>
                  <ItemFace item={selectedItem} />
                  <p>{getItemDefinition(selectedItem.itemId).size.join('×')}マス</p>
                </div>
                <div className="action-stack">
                  <ActionButton onClick={rotateSelected} disabled={selectedBagItem === undefined}>90°回転</ActionButton>
                  <ActionButton onClick={storeSelected} disabled={selectedBagItem === undefined}>ストレージへ</ActionButton>
                  <ActionButton onClick={sellSelected}>売却 {getBaseSellPrice(selectedItem.itemId)}G</ActionButton>
                </div>
              </>
            )}
            <p className="notice" role="status">{notice}</p>
            <p className="touch-hint">スマートフォンでは装備を少し長押ししてから動かします。</p>
          </aside>
        </section>

        <DragOverlay>
          {activeItem === undefined ? null : (
            <div className={`item-card drag-overlay rarity-${getItemDefinition(activeItem.itemId).rarity}`}>
              <ItemFace item={activeItem} />
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </main>
  )
}

export function previewCanPlace(item: RunInventoryItem, inventory: RunInventorySnapshot) {
  return canPlaceBagItem(inventory.bag, item, { row: 0, column: 0 })
}
