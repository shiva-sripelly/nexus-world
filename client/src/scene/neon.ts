import { Color } from 'three'

/** A colour pushed above 1.0 so the bloom pass makes it glow (needs toneMapped=false). */
export function glow(hex: string, strength = 3): Color {
  return new Color(hex).multiplyScalar(strength)
}

/** Small deterministic PRNG, so the arena decoration looks the same every load. */
export function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const NEON = '#ff3df2'
export const NEON_ALT = '#8b5cf6'
export const SENTINEL = '#ff2d55'
