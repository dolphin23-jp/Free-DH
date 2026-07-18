export type StatusKind = 'poison' | 'burn' | 'slow'

export const BURN_DURATION_SECONDS = 3
export const SLOW_COOLDOWN_PROGRESS_MULTIPLIER = 0.8

const TICKS_PER_SECOND = 10
const BURN_DURATION_TICKS = BURN_DURATION_SECONDS * TICKS_PER_SECOND

export interface BurnBatch {
  stacks: number
  remainingTicks: number
}

export interface StatusState {
  poisonStacks: number
  burnBatches: BurnBatch[]
  slowRemainingTicks: number
}

export interface BurnBatchSetup {
  stacks: number
  remainingSeconds: number
}

export interface StatusSetup {
  poisonStacks?: number
  burnBatches?: readonly BurnBatchSetup[]
  slowSeconds?: number
}

function requireFiniteNonNegative(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a finite non-negative number`)
  }

  return value
}

function secondsToTicks(seconds: number, label: string): number {
  const validSeconds = requireFiniteNonNegative(seconds, label)
  return Math.round(validSeconds * TICKS_PER_SECOND)
}

export function createStatusState(input?: StatusSetup): StatusState {
  return {
    poisonStacks: requireFiniteNonNegative(input?.poisonStacks ?? 0, 'status.poisonStacks'),
    burnBatches: (input?.burnBatches ?? [])
      .map((batch, index) => ({
        stacks: requireFiniteNonNegative(batch.stacks, `status.burnBatches[${index}].stacks`),
        remainingTicks: secondsToTicks(
          batch.remainingSeconds,
          `status.burnBatches[${index}].remainingSeconds`,
        ),
      }))
      .filter((batch) => batch.stacks > 0 && batch.remainingTicks > 0),
    slowRemainingTicks: secondsToTicks(input?.slowSeconds ?? 0, 'status.slowSeconds'),
  }
}

export function cloneStatusState(state: StatusState): StatusState {
  return {
    poisonStacks: state.poisonStacks,
    burnBatches: state.burnBatches.map((batch) => ({ ...batch })),
    slowRemainingTicks: state.slowRemainingTicks,
  }
}

export function applyStatus(state: StatusState, status: StatusKind, value: number): void {
  const amount = requireFiniteNonNegative(value, `status.${status}`)

  if (amount === 0) {
    return
  }

  if (status === 'poison') {
    state.poisonStacks += amount
    return
  }

  if (status === 'burn') {
    state.burnBatches.push({ stacks: amount, remainingTicks: BURN_DURATION_TICKS })
    return
  }

  state.slowRemainingTicks += secondsToTicks(amount, 'status.slow')
}

export function cleansePoisonAndBurn(state: StatusState): void {
  state.poisonStacks = 0
  state.burnBatches = []
}

export function getBurnStacks(state: StatusState): number {
  return state.burnBatches.reduce((total, batch) => total + batch.stacks, 0)
}

export function isSlowed(state: StatusState): boolean {
  return state.slowRemainingTicks > 0
}

/**
 * Advances durations for effects that existed before the action phases.
 * Call after CD progression and before new status applications in the same tick.
 */
export function advanceStatusDurations(state: StatusState): void {
  state.burnBatches = state.burnBatches
    .map((batch) => ({ ...batch, remainingTicks: batch.remainingTicks - 1 }))
    .filter((batch) => batch.remainingTicks > 0)

  if (state.slowRemainingTicks > 0) {
    state.slowRemainingTicks -= 1
  }
}
