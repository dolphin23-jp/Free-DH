import { useEffect, useMemo, useState } from 'react'
import { useStore } from 'zustand'

import { gameConfig, items } from '../data'
import {
  getRerollCost,
  getShopSellPrice,
  type ShopOffer,
  type ShopSpecialOffer,
} from '../engine/shop'
import { codexStore } from '../store/codex'
import {
  applyShopHeal,
  purchaseShopOffer,
  purchaseShopSpecialOffer,
  sellInventoryItemToShop,
  shopStore,
} from '../store/shop'
import { runStore, type RunInventorySnapshot } from '../store/run'

interface ShopScreenProps {
  onClose: () => void
}

const itemById = new Map(items.map((item) => [item.id, item]))

export function ShopScreen({ onClose }: ShopScreenProps) {
  const state = useStore(runStore)
  const shop = useStore(shopStore)
  const [notice, setNotice] = useState('装備の購入、売却、回復を行えます。')
  const inventory = useMemo<RunInventorySnapshot>(
    () => ({ bag: state.bag, storage: state.storage }),
    [state.bag, state.storage],
  )
  const activeBagItemIds = state.bag.items.map((item) => item.itemId)
  const allItems = [
    ...state.bag.items.map((item) => ({ item, source: 'カバン' })),
    ...state.storage.items.map((item) => ({ item, source: 'ストレージ' })),
  ]

  useEffect(() => {
    if (shop.listing !== null) {
      codexStore.getState().discoverItems(shop.listing.offers.map((offer) => offer.itemId))
    }
  }, [shop.listing])

  if (shop.listing === null) {
    return (
      <main className="app-shell shop-screen">
        <section className="intro-panel">
          <h1>Shop unavailable</h1>
          <p>現在の周回状態からショップを準備できませんでした。</p>
          <button type="button" className="shop-close" onClick={onClose}>
            戻る
          </button>
        </section>
      </main>
    )
  }

  const buy = (offer: ShopOffer) => {
    try {
      const result = purchaseShopOffer(inventory, state.gold, offer)
      state.replaceInventory(result.inventory)
      runStore.setState({ gold: result.gold })
      shop.markPurchased(offer.slot)
      setNotice(`${itemById.get(offer.itemId)?.name ?? offer.itemId}を購入しました。`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '購入できませんでした。')
    }
  }

  const buySpecial = (offer: ShopSpecialOffer) => {
    const alreadyPurchased =
      offer.kind === 'cursedChest' ? shop.cursedChestPurchased : shop.gamblerPurchased
    if (alreadyPurchased) return
    try {
      const result = purchaseShopSpecialOffer(inventory, state.gold, offer)
      state.replaceInventory(result.inventory)
      runStore.setState({ gold: result.gold })
      shop.markSpecialPurchased(offer.kind)
      codexStore.getState().discoverItems([offer.reward.itemId])
      const name = itemById.get(offer.reward.itemId)?.name ?? offer.reward.itemId
      setNotice(
        offer.kind === 'cursedChest'
          ? `${name}を獲得しました。最大HP-${gameConfig.shop.cursedChest.maxHpPenalty}の呪い付きです。`
          : `ギャンブル袋から${name}を獲得しました。`,
      )
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '特別商品を購入できませんでした。')
    }
  }

  const reroll = () => {
    const cost = getRerollCost(shop.listing!.rerollCount)
    if (state.gold < cost) {
      setNotice('リロールに必要なゴールドが足りません。')
      return
    }
    shop.reroll()
    runStore.setState((current) => ({ gold: current.gold - cost }))
    setNotice(`${cost}Gで陳列を更新しました。特別イベントは変化しません。`)
  }

  const heal = () => {
    try {
      const result = applyShopHeal(state.currentHp, state.maxHp, state.gold, shop.healUsed)
      runStore.setState({ currentHp: result.currentHp, gold: result.gold })
      shop.markHealUsed()
      setNotice(`HPを${gameConfig.shop.healService.hp}回復しました。`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '回復サービスを利用できませんでした。')
    }
  }

  const sell = (instanceId: string) => {
    try {
      const result = sellInventoryItemToShop(inventory, state.gold, instanceId)
      state.replaceInventory(result.inventory)
      runStore.setState({ gold: result.gold })
      setNotice(
        `${itemById.get(result.item.itemId)?.name ?? result.item.itemId}を${result.price}Gで売却しました。`,
      )
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '売却できませんでした。')
    }
  }

  const rerollCost = getRerollCost(shop.listing.rerollCount)
  const storageFull = state.storage.items.length >= state.storage.capacity
  const cursedChest = shop.listing.specials.cursedChest
  const gambler = shop.listing.specials.gambler

  return (
    <main className="app-shell shop-screen">
      <header className="shop-header">
        <div>
          <p className="eyebrow">Deterministic merchant</p>
          <h1>Shop</h1>
        </div>
        <div className="shop-header__actions">
          <strong>{Math.round(state.gold)}G</strong>
          <button type="button" className="shop-close" onClick={onClose}>
            配置へ戻る
          </button>
        </div>
      </header>

      <section className="shop-toolbar">
        <div>
          <span>AREA {shop.listing.area}</span>
          <span>SHOP STREAM {shop.listing.streamSeed}</span>
          <span>EVENT STREAM {shop.listing.specials.streamSeed}</span>
          <span>REROLL {shop.listing.rerollCount}</span>
        </div>
        <button type="button" onClick={reroll} disabled={state.gold < rerollCost}>
          リロール {rerollCost}G
        </button>
      </section>

      <section className="shop-offers" aria-label="ショップ陳列">
        {shop.listing.offers.map((offer) => {
          const item = itemById.get(offer.itemId)
          const purchased = shop.purchasedSlots.includes(offer.slot)
          return (
            <article
              key={`${shop.listing!.streamSeed}:${offer.slot}`}
              className={`shop-offer rarity-${offer.rarity}${purchased ? ' is-purchased' : ''}`}
            >
              <span className="shop-offer__rarity">{offer.rarity}</span>
              <h2>{item?.name ?? offer.itemId}</h2>
              <p>{item?.size.join('×') ?? '?'}マス</p>
              <strong>{offer.price}G</strong>
              <button
                type="button"
                onClick={() => buy(offer)}
                disabled={purchased || state.gold < offer.price || storageFull}
              >
                {purchased ? '購入済み' : storageFull ? 'ストレージ満杯' : '購入'}
              </button>
            </article>
          )
        })}
      </section>

      {cursedChest !== null || gambler !== null ? (
        <section className="shop-specials" aria-label="特別な商人イベント">
          {cursedChest !== null ? (
            <article className={`shop-special cursed${shop.cursedChestPurchased ? ' is-purchased' : ''}`}>
              <div>
                <p className="eyebrow">Push your luck</p>
                <h2>呪いの宝箱</h2>
                <p>
                  紫以上の装備が確定。ただし装備中は最大HP-
                  {gameConfig.shop.cursedChest.maxHpPenalty}。
                </p>
                {shop.cursedChestPurchased ? (
                  <strong>
                    獲得: {itemById.get(cursedChest.reward.itemId)?.name ?? cursedChest.reward.itemId}
                  </strong>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => buySpecial(cursedChest)}
                disabled={
                  shop.cursedChestPurchased || state.gold < cursedChest.cost || storageFull
                }
              >
                {shop.cursedChestPurchased
                  ? '開封済み'
                  : storageFull
                    ? 'ストレージ満杯'
                    : `${cursedChest.cost}Gで開封`}
              </button>
            </article>
          ) : null}

          {gambler !== null ? (
            <article className={`shop-special gambler${shop.gamblerPurchased ? ' is-purchased' : ''}`}>
              <div>
                <p className="eyebrow">Equal rarity odds</p>
                <h2>ギャンブル商人</h2>
                <p>白・緑・青・紫・橙が各{gameConfig.shop.gambler.rarityPercentEach}%の秘密袋。</p>
                {shop.gamblerPurchased ? (
                  <strong>
                    獲得: {itemById.get(gambler.reward.itemId)?.name ?? gambler.reward.itemId}
                  </strong>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => buySpecial(gambler)}
                disabled={shop.gamblerPurchased || state.gold < gambler.cost || storageFull}
              >
                {shop.gamblerPurchased
                  ? '購入済み'
                  : storageFull
                    ? 'ストレージ満杯'
                    : `${gambler.cost}Gで購入`}
              </button>
            </article>
          ) : null}
        </section>
      ) : null}

      <section className="shop-services">
        <article className="panel shop-heal">
          <div>
            <p className="eyebrow">One use per shop</p>
            <h2>回復サービス</h2>
            <p>
              HP {Math.round(state.currentHp)} / {Math.round(state.maxHp)}
            </p>
          </div>
          <button
            type="button"
            onClick={heal}
            disabled={
              shop.healUsed ||
              state.currentHp >= state.maxHp ||
              state.gold < gameConfig.shop.healService.cost
            }
          >
            {shop.healUsed
              ? '利用済み'
              : `HP+${gameConfig.shop.healService.hp} / ${gameConfig.shop.healService.cost}G`}
          </button>
        </article>

        <article className="panel shop-sell-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Inventory liquidation</p>
              <h2>売却</h2>
            </div>
            <span>秤ボーナス込み</span>
          </div>
          {allItems.length === 0 ? (
            <p className="muted">売却できる装備がありません。</p>
          ) : (
            <div className="shop-sell-list">
              {allItems.map(({ item, source }) => {
                const definition = itemById.get(item.itemId)
                const price = getShopSellPrice(item.itemId, activeBagItemIds)
                return (
                  <div key={item.instanceId} className="shop-sell-row">
                    <div>
                      <span>{source}</span>
                      <strong>{definition?.name ?? item.itemId}</strong>
                    </div>
                    <button type="button" onClick={() => sell(item.instanceId)}>
                      {price}Gで売却
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </article>
      </section>

      <p className="shop-notice" role="status">
        {notice}
      </p>
    </main>
  )
}
