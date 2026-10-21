import raw from '../../../shared/constants.json'

export interface Box {
  x: number
  z: number
  hx: number
  hz: number
}

export interface Point {
  x: number
  z: number
}

export const C = raw as typeof raw & { obstacles: Box[]; spawnPoints: Point[]; enemySpawnPoints: Point[] }

export const TICK_RATE = C.tickRate
export const TICK_DT = 1 / TICK_RATE
export const HALF = C.arenaHalfSize
export const COLORS: string[] = C.colors
export const ACCESSORIES: string[] = C.accessories
export type Accessory = 'none' | 'visor' | 'horns' | 'antenna' | 'halo'
