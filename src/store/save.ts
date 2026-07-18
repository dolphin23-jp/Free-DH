import type { StoreApi } from 'zustand/vanilla'

import {
  createCodexStore,
  exportCodexSnapshot,
  type CodexSnapshot,
  type CodexStoreState,
} from './codex'
import {
  createRunStore,
  exportRunSnapshot,
  type RunSnapshot,
  type RunStoreState,
} from './run'

export const GAME_SAVE_VERSION = 1

export interface GameSaveSnapshot {
  version: typeof GAME_SAVE_VERSION
  run: RunSnapshot
  codex: CodexSnapshot
}

export function exportGameSave(
  runState: RunStoreState,
  codexState: CodexStoreState,
): GameSaveSnapshot {
  return {
    version: GAME_SAVE_VERSION,
    run: exportRunSnapshot(runState),
    codex: exportCodexSnapshot(codexState),
  }
}

export function loadGameSave(
  snapshot: GameSaveSnapshot,
  run: StoreApi<RunStoreState>,
  codex: StoreApi<CodexStoreState>,
): void {
  if (snapshot.version !== GAME_SAVE_VERSION) {
    throw new Error(`Unsupported game save version: ${snapshot.version}`)
  }

  // Validate both halves before mutating either live store.
  createRunStore(snapshot.run)
  createCodexStore(snapshot.codex)

  run.getState().loadSnapshot(snapshot.run)
  codex.getState().loadSnapshot(snapshot.codex)
}
