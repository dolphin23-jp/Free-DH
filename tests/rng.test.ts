import { describe, expect, it } from 'vitest'

import { fork, mulberry32, normalizeSeed } from '../src/engine/rng'

describe('mulberry32', () => {
  it('matches the fixed vector for a known numeric seed', () => {
    const random = mulberry32(123456789)

    expect(Array.from({ length: 6 }, () => random())).toEqual([
      0.2577907438389957,
      0.9707721115555614,
      0.7853280142880976,
      0.20616457983851433,
      0.30307188746519387,
      0.7470660470426083,
    ])
  })

  it('normalizes numeric seeds to unsigned 32-bit values', () => {
    expect(normalizeSeed(-1)).toBe(0xffffffff)
    expect(normalizeSeed(0x1_0000_0001)).toBe(1)
  })

  it('rejects non-finite numeric seeds', () => {
    expect(() => mulberry32(Number.NaN)).toThrow(TypeError)
    expect(() => mulberry32(Number.POSITIVE_INFINITY)).toThrow(TypeError)
  })
})

describe('fork', () => {
  it('matches fixed child-seed and stream vectors', () => {
    const battleSeed = fork('run-001', 'battle:0')
    const dropsSeed = fork('run-001', 'drops:0')

    expect(battleSeed).toBe(1729143002)
    expect(dropsSeed).toBe(3399681390)

    const battleRandom = mulberry32(battleSeed)
    const dropsRandom = mulberry32(dropsSeed)

    expect(Array.from({ length: 3 }, () => battleRandom())).toEqual([
      0.4253139526117593,
      0.2635037014260888,
      0.9261526779737324,
    ])
    expect(Array.from({ length: 3 }, () => dropsRandom())).toEqual([
      0.7572633656673133,
      0.7094047632999718,
      0.4330420750193298,
    ])
  })

  it('keeps differently labelled streams independent', () => {
    const leftSeed = fork('parent', 'left')
    const rightSeed = fork('parent', 'right')

    expect(leftSeed).not.toBe(rightSeed)

    const left = mulberry32(leftSeed)
    const right = mulberry32(rightSeed)
    const freshRight = mulberry32(rightSeed)

    left()
    left()
    left()

    expect([right(), right(), right()]).toEqual([freshRight(), freshRight(), freshRight()])
  })

  it('reproduces the same stream for the same parent seed and label', () => {
    const first = mulberry32(fork('run-001', 'enemyOrder:1'))
    const second = mulberry32(fork('run-001', 'enemyOrder:1'))

    expect(Array.from({ length: 10 }, () => first())).toEqual(
      Array.from({ length: 10 }, () => second()),
    )
  })
})
