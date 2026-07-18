import { useMemo, useState } from 'react'
import { useStore } from 'zustand'

import { enemies, items, recipes, type RuntimeEnemy } from '../data'
import { codexStore } from '../store/codex'

interface CodexScreenProps {
  onClose: () => void
}

type CodexTab = 'items' | 'enemies' | 'recipes'

const itemById = new Map(items.map((item) => [item.id, item]))

function enemyHpText(enemy: RuntimeEnemy): string {
  if ('hp' in enemy) return `HP ${enemy.hp}`
  return enemy.phases.map((phase, index) => `P${index + 1} ${phase.hp}`).join(' / ')
}

function enemyAbilityNames(enemy: RuntimeEnemy): string[] {
  if ('hp' in enemy) return enemy.abilities.map((ability) => ability.name)
  return enemy.phases.flatMap((phase) => phase.abilities.map((ability) => ability.name))
}

function UnknownCard({ label }: { label: string }) {
  return (
    <article className="codex-card codex-card--unknown">
      <div className="codex-silhouette" aria-hidden="true">?</div>
      <span>{label}</span>
      <strong>???</strong>
      <p>未発見</p>
    </article>
  )
}

export function CodexScreen({ onClose }: CodexScreenProps) {
  const codex = useStore(codexStore)
  const [tab, setTab] = useState<CodexTab>('items')
  const discoveredItems = useMemo(
    () => new Set(codex.discoveredItemIds),
    [codex.discoveredItemIds],
  )
  const discoveredEnemies = useMemo(
    () => new Set(codex.discoveredEnemyIds),
    [codex.discoveredEnemyIds],
  )
  const discoveredRecipes = useMemo(
    () => new Set(codex.discoveredRecipeIds),
    [codex.discoveredRecipeIds],
  )

  return (
    <main className="app-shell codex-screen">
      <header className="codex-header">
        <div>
          <p className="eyebrow">Persistent discoveries</p>
          <h1>Codex</h1>
        </div>
        <button type="button" className="codex-close" onClick={onClose}>
          ゲームへ戻る
        </button>
      </header>

      <section className="codex-summary" aria-label="図鑑の発見状況">
        <div>
          <span>Items</span>
          <strong>{codex.discoveredItemIds.length}/{items.length}</strong>
        </div>
        <div>
          <span>Enemies</span>
          <strong>{codex.discoveredEnemyIds.length}/{enemies.length}</strong>
        </div>
        <div>
          <span>Recipes</span>
          <strong>{codex.discoveredRecipeIds.length}/{recipes.length}</strong>
        </div>
      </section>

      <nav className="codex-tabs" aria-label="図鑑カテゴリ">
        <button type="button" className={tab === 'items' ? 'is-active' : ''} onClick={() => setTab('items')}>
          アイテム
        </button>
        <button type="button" className={tab === 'enemies' ? 'is-active' : ''} onClick={() => setTab('enemies')}>
          敵
        </button>
        <button type="button" className={tab === 'recipes' ? 'is-active' : ''} onClick={() => setTab('recipes')}>
          融合レシピ
        </button>
      </nav>

      {tab === 'items' ? (
        <section className="codex-grid" aria-label="アイテム図鑑">
          {items.map((item) =>
            discoveredItems.has(item.id) ? (
              <article key={item.id} className={`codex-card rarity-${item.rarity}`}>
                <span>{item.id} · {item.rarity}</span>
                <strong>{item.name}</strong>
                <p>{item.size.join('×')}マス · {item.tags.join(' / ')}</p>
              </article>
            ) : (
              <UnknownCard key={item.id} label="ITEM" />
            ),
          )}
        </section>
      ) : null}

      {tab === 'enemies' ? (
        <section className="codex-grid codex-grid--enemies" aria-label="敵図鑑">
          {enemies.map((enemy) =>
            discoveredEnemies.has(enemy.id) ? (
              <article key={enemy.id} className={`codex-card codex-enemy-card${enemy.isBoss ? ' is-boss' : ''}`}>
                <span>AREA {enemy.area} · {enemy.isBoss ? 'BOSS' : 'ENEMY'}</span>
                <strong>{enemy.name}</strong>
                <p>{enemyHpText(enemy)} · 報酬 {enemy.gold}G</p>
                <small>{enemyAbilityNames(enemy).join(' / ')}</small>
              </article>
            ) : (
              <UnknownCard key={enemy.id} label={`AREA ${enemy.area}`} />
            ),
          )}
        </section>
      ) : null}

      {tab === 'recipes' ? (
        <section className="codex-grid codex-grid--recipes" aria-label="融合レシピ図鑑">
          {recipes.map((recipe) => {
            if (!discoveredRecipes.has(recipe.id)) {
              return <UnknownCard key={recipe.id} label="RECIPE" />
            }
            const a = itemById.get(recipe.a)
            const b = itemById.get(recipe.b)
            const result = itemById.get(recipe.result)
            return (
              <article key={recipe.id} className="codex-card codex-recipe-card">
                <span>{recipe.id}</span>
                <strong>{a?.name ?? recipe.a} + {b?.name ?? recipe.b}</strong>
                <p>→ {result?.name ?? recipe.result}</p>
              </article>
            )
          })}
        </section>
      ) : null}
    </main>
  )
}
