import { Howl, Howler } from 'howler'

import type { Rarity } from '../data'

interface ToneSpec {
  frequencies: readonly number[]
  durationSeconds: number
  volume: number
}

const SAMPLE_RATE = 8000

const RARITY_TONES: Readonly<Record<Rarity, ToneSpec>> = {
  common: { frequencies: [330], durationSeconds: 0.12, volume: 0.55 },
  uncommon: { frequencies: [392, 523], durationSeconds: 0.14, volume: 0.6 },
  rare: { frequencies: [523, 659], durationSeconds: 0.16, volume: 0.65 },
  epic: { frequencies: [659, 784, 988], durationSeconds: 0.2, volume: 0.72 },
  legendary: {
    frequencies: [523, 659, 784, 1047],
    durationSeconds: 0.34,
    volume: 0.82,
  },
}

const OPENING_TONE: ToneSpec = {
  frequencies: [180, 220],
  durationSeconds: 0.09,
  volume: 0.5,
}

interface PresentationSounds {
  opening: Howl
  rarity: Record<Rarity, Howl>
}

let sounds: PresentationSounds | null = null

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index))
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 1024
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

function createToneDataUri(spec: ToneSpec): string {
  const sampleCount = Math.max(1, Math.round(SAMPLE_RATE * spec.durationSeconds))
  const bytes = new Uint8Array(44 + sampleCount)
  const view = new DataView(bytes.buffer)

  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, 36 + sampleCount, true)
  writeAscii(view, 8, 'WAVE')
  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, SAMPLE_RATE, true)
  view.setUint32(28, SAMPLE_RATE, true)
  view.setUint16(32, 1, true)
  view.setUint16(34, 8, true)
  writeAscii(view, 36, 'data')
  view.setUint32(40, sampleCount, true)

  for (let index = 0; index < sampleCount; index += 1) {
    const time = index / SAMPLE_RATE
    const progress = index / sampleCount
    const envelope = Math.pow(1 - progress, 2)
    const wave =
      spec.frequencies.reduce(
        (total, frequency) => total + Math.sin(2 * Math.PI * frequency * time),
        0,
      ) / spec.frequencies.length
    bytes[44 + index] = Math.max(0, Math.min(255, Math.round(128 + wave * envelope * 52)))
  }

  return `data:audio/wav;base64,${bytesToBase64(bytes)}`
}

function createSound(spec: ToneSpec): Howl {
  return new Howl({
    src: [createToneDataUri(spec)],
    format: ['wav'],
    preload: true,
    volume: spec.volume,
  })
}

function getSounds(): PresentationSounds {
  if (sounds !== null) return sounds
  sounds = {
    opening: createSound(OPENING_TONE),
    rarity: {
      common: createSound(RARITY_TONES.common),
      uncommon: createSound(RARITY_TONES.uncommon),
      rare: createSound(RARITY_TONES.rare),
      epic: createSound(RARITY_TONES.epic),
      legendary: createSound(RARITY_TONES.legendary),
    },
  }
  return sounds
}

export function syncAudioSettings(volume: number, muted: boolean): void {
  Howler.volume(Math.max(0, Math.min(1, volume)))
  Howler.mute(muted)
}

export function playChestOpeningSound(): void {
  getSounds().opening.play()
}

export function playRaritySound(rarity: Rarity): void {
  const sound = getSounds().rarity[rarity]
  sound.stop()
  sound.play()
}
