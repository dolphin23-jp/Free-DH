export type Seed = number | string
export type RandomGenerator = () => number

export interface RandomStep {
  state: number
  value: number
}

const UINT32_RANGE = 0x1_0000_0000
const MULBERRY_INCREMENT = 0x6d2b79f5
const FNV_OFFSET_BASIS = 0x811c9dc5
const FNV_PRIME = 0x01000193

/**
 * Produces a stable unsigned 32-bit seed from a string.
 *
 * The hash algorithm is FNV-1a over JavaScript UTF-16 code units. This exact
 * behavior is covered by fixed-vector tests because changing it would change
 * every forked random stream.
 */
export function hashSeed(value: string): number {
  let hash = FNV_OFFSET_BASIS

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, FNV_PRIME)
  }

  return hash >>> 0
}

export function normalizeSeed(seed: Seed): number {
  if (typeof seed === 'string') {
    return hashSeed(seed)
  }

  if (!Number.isFinite(seed)) {
    throw new TypeError('RNG seed must be a finite number or string')
  }

  return seed >>> 0
}

/**
 * Derives an independent child seed using the COMBAT_SPEC §2 naming rule.
 */
export function fork(seed: Seed, label: string): number {
  return hashSeed(`${String(seed)}:${label}`)
}

/**
 * Advances a serializable mulberry32 state by exactly one draw.
 */
export function nextMulberry32(state: number): RandomStep {
  const nextState = (normalizeSeed(state) + MULBERRY_INCREMENT) >>> 0

  let value = nextState
  value = Math.imul(value ^ (value >>> 15), value | 1)
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61)

  return {
    state: nextState,
    value: ((value ^ (value >>> 14)) >>> 0) / UINT32_RANGE,
  }
}

/**
 * Deterministic mulberry32 PRNG returning values in the half-open range [0, 1).
 */
export function mulberry32(seed: Seed): RandomGenerator {
  let state = normalizeSeed(seed)

  return () => {
    const step = nextMulberry32(state)
    state = step.state
    return step.value
  }
}
