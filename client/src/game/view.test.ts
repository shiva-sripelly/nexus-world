import { describe, expect, it } from 'vitest'
import type { SnapPlayer, Snapshot } from '../net/protocol'
import { SnapshotBuffer, createView, interpolate, lerpAngle } from './view'

const player = (over: Partial<SnapPlayer> = {}): SnapPlayer => ({
  id: 'p',
  x: 0,
  z: 0,
  a: 0,
  hp: 100,
  al: true,
  pr: false,
  s: 0,
  k: 0,
  d: 0,
  on: true,
  ...over,
})

const snap = (tick: number, players: SnapPlayer[], over: Partial<Snapshot> = {}): Snapshot => ({
  tick,
  phase: 'playing',
  timeLeft: 100,
  countdown: 0,
  players,
  enemies: [],
  bolts: [],
  events: [],
  ...over,
})

describe('interpolation', () => {
  it('blends positions between two snapshots', () => {
    const view = createView()
    interpolate(snap(2, [player({ x: 0 })]), snap(4, [player({ x: 0.6 })]), 0.25, view)
    expect(view.players.get('p')!.x).toBeCloseTo(0.15)
  })

  it('does not slide a respawning player across the map', () => {
    const view = createView()
    interpolate(snap(2, [player({ x: -20 })]), snap(4, [player({ x: 20 })]), 0.5, view)
    expect(view.players.get('p')!.x).toBe(20)
  })

  it('takes the short way round when blending angles', () => {
    expect(lerpAngle(3, -3, 0.5)).toBeCloseTo(Math.PI, 1)
  })

  it('drops players that are no longer in the snapshot', () => {
    const view = createView()
    interpolate(snap(2, [player()]), snap(4, [player()]), 0, view)
    interpolate(snap(4, []), snap(6, []), 0, view)
    expect(view.players.size).toBe(0)
  })

  it('lerps bolts that exist in both snapshots and adds new ones at their position', () => {
    const view = createView()
    const a = snap(2, [], { bolts: [{ id: 1, x: 0, z: 0, o: 'p' }] })
    const b = snap(4, [], { bolts: [{ id: 1, x: 4, z: 0, o: 'p' }, { id: 2, x: 9, z: 9, o: 'p' }] })
    interpolate(a, b, 0.5, view)
    expect(view.bolts).toEqual([
      { id: 1, x: 2, z: 0, o: 'p' },
      { id: 2, x: 9, z: 9, o: 'p' },
    ])
  })
})

describe('SnapshotBuffer', () => {
  it('ignores out-of-order snapshots and samples by tick', () => {
    const buf = new SnapshotBuffer()
    buf.push(snap(2, [player({ x: 0 })]))
    buf.push(snap(6, [player({ x: 2 })]))
    buf.push(snap(4, [player({ x: 99 })])) // late, ignored
    expect(buf.size).toBe(2)
    const view = createView()
    buf.sample(4, view)
    expect(view.players.get('p')!.x).toBeCloseTo(1)
  })

  it('clamps to the newest snapshot instead of extrapolating', () => {
    const buf = new SnapshotBuffer()
    buf.push(snap(2, [player({ x: 0 })]))
    buf.push(snap(4, [player({ x: 2 })]))
    const view = createView()
    buf.sample(40, view)
    expect(view.players.get('p')!.x).toBe(2)
  })
})
