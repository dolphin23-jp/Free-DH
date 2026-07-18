import { useState } from 'react'
import { useStore } from 'zustand'

import { gameConfig } from '../data'
import {
  getAvailableBossExpansionChoices,
  runStore,
  type BossBenefitChoice,
  type BossExpansionChoice,
} from '../store/run'

interface BossRewardScreenProps {
  onClaim: (expansion: BossExpansionChoice, benefit: BossBenefitChoice) => void
}

const expansionLabels: Record<BossExpansionChoice, string> = {
  column: 'カバンを横に拡張（+1列）',
  row: 'カバンを縦に拡張（+1行）',
}

export function BossRewardScreen({ onClaim }: BossRewardScreenProps) {
  const state = useStore(runStore)
  const [expansion, setExpansion] = useState<BossExpansionChoice | null>(null)
  const [benefit, setBenefit] = useState<BossBenefitChoice | null>(null)
  const choices = getAvailableBossExpansionChoices(state.bag)
  const healAmount = Math.round(state.maxHp * (gameConfig.bossChoice.healMaxHpPercent / 100))

  return (
    <main className="app-shell boss-reward-screen">
      <header className="boss-reward-header">
        <div>
          <p className="eyebrow">Area boss defeated</p>
          <h1>Boss Reward</h1>
        </div>
        <div className="boss-reward-current">
          <span>現在のカバン</span>
          <strong>{state.bag.columns}×{state.bag.rows}</strong>
        </div>
      </header>

      <section className="boss-reward-grid">
        <article className="panel reward-choice-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Guaranteed upgrade</p>
              <h2>拡張キット</h2>
            </div>
            <span>1つ選択</span>
          </div>
          <p className="reward-description">
            カバンの列または行を増やします。配置済みの装備はそのまま維持されます。
          </p>
          <div className="reward-option-list">
            {choices.map((choice) => (
              <button
                key={choice}
                type="button"
                className={expansion === choice ? 'is-selected' : ''}
                onClick={() => setExpansion(choice)}
              >
                <strong>{expansionLabels[choice]}</strong>
                <span>
                  {state.bag.columns + (choice === 'column' ? 1 : 0)}×
                  {state.bag.rows + (choice === 'row' ? 1 : 0)}へ
                </span>
              </button>
            ))}
          </div>
        </article>

        <article className="panel reward-choice-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Push your luck</p>
              <h2>追加報酬</h2>
            </div>
            <span>1つ選択</span>
          </div>
          <p className="reward-description">
            安全に立て直すか、さらに宝箱を開けるかを選びます。
          </p>
          <div className="reward-option-list">
            <button
              type="button"
              className={benefit === 'heal' ? 'is-selected' : ''}
              onClick={() => setBenefit('heal')}
            >
              <strong>最大HPの{gameConfig.bossChoice.healMaxHpPercent}%回復</strong>
              <span>
                HP {Math.round(state.currentHp)} → 最大 {Math.round(Math.min(state.maxHp, state.currentHp + healAmount))}
              </span>
            </button>
            <button
              type="button"
              className={benefit === 'additionalDrops' ? 'is-selected' : ''}
              onClick={() => setBenefit('additionalDrops')}
            >
              <strong>追加ドロップ {gameConfig.bossChoice.additionalDropSlots}枠</strong>
              <span>同じボス戦のドロップストリームから続けて抽選</span>
            </button>
          </div>
        </article>
      </section>

      <footer className="boss-reward-footer">
        <div>
          <strong>両方の報酬を選択してください</strong>
          <span>選択を確定すると、このボス報酬は変更できません。</span>
        </div>
        <button
          type="button"
          disabled={expansion === null || benefit === null}
          onClick={() => {
            if (expansion !== null && benefit !== null) onClaim(expansion, benefit)
          }}
        >
          報酬を確定
        </button>
      </footer>
    </main>
  )
}
