import { describe, expect, it } from 'vitest'
import type { ReplayFile, Snapshot } from '../net/protocol'
import { ReplayPlayer } from './replayPlayer'

function frame(tick: number, x: number, events: Snapshot['events'] = []): Snapshot {
  return {
    tick,
    phase: 'playing',
    timeLeft: 10,
    countdown: 0,
    players: [{ id: 'p', x, z: 0, a: 0, hp: 100, al: true, pr: false, s: 0, k: 0, d: 0, on: true }],
    enemies: [],
    bolts: [],
    events,
  }
}

const replay: ReplayFile = {
  header: {
    version: 1,
    matchId: 'm',
    mode: 'ranked',
    tickRate: 30,
    roster: [{ id: 'p', name: 'P', color: '#fff', accessory: 'none', is_bot: false }],
  },
  frames: [frame(2, 0), frame(4, 2, [{ type: 'kill', killer: null, victim: 'p' }]), frame(6, 4)],
}

describe('ReplayPlayer', () => {
  it('plays forward and stops at the end', () => {
    const r = new ReplayPlayer(replay)
    r.update(1)
    expect(r.progress).toBe(1)
    expect(r.playing).toBe(false)
    expect(r.view.players.get('p')!.x).toBe(4)
  })

  it('seeks and interpolates', () => {
    const r = new ReplayPlayer(replay)
    r.playing = false
    r.seek(0.25) // tick 3
    r.update(0)
    expect(r.view.players.get('p')!.x).toBeCloseTo(1)
  })

  it('reports events as playback crosses them', () => {
    const r = new ReplayPlayer(replay)
    r.playing = false
    expect(r.update(0).events).toEqual([])
    r.seek(0.5)
    r.playing = true
    const { events } = r.update(0.001)
    expect(events).toEqual([])
    r.seek(0.4)
    expect(r.update(0.1).events.length).toBe(1)
  })
})
