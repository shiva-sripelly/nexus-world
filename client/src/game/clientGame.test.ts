import { describe, expect, it } from 'vitest'
import type { RosterEntry, SnapPlayer, Snapshot } from '../net/protocol'
import { ClientGame, type InputMessage } from './clientGame'
import { TICK_DT } from './constants'
import type { InputSample } from './input'
import { stepPlayer } from './physics'

const roster: RosterEntry[] = [
  { id: 'me', name: 'Me', color: '#22d3ee', accessory: 'none', is_bot: false },
  { id: 'bot', name: 'Bot', color: '#facc15', accessory: 'none', is_bot: true },
]

function snapshot(tick: number, me: Partial<SnapPlayer>, phase: Snapshot['phase'] = 'playing'): Snapshot {
  const base: SnapPlayer = { id: 'me', x: -20, z: 24, a: 0, hp: 100, al: true, pr: false, s: 0, k: 0, d: 0, q: 0, on: true }
  return {
    tick,
    phase,
    timeLeft: 100,
    countdown: 0,
    players: [{ ...base, ...me }, { ...base, id: 'bot', x: 20, z: 20 }],
    enemies: [],
    bolts: [],
    events: [],
  }
}

const right: () => InputSample = () => ({ mx: 1, mz: 0, aim: 0, fire: false })

describe('ClientGame prediction', () => {
  it('sends one input per tick and moves the local player immediately', () => {
    const sent: InputMessage[] = []
    const game = new ClientGame('me', roster, (m) => sent.push(m))
    game.onSnapshot(snapshot(10, {}))
    game.update(TICK_DT * 3 + 1e-6, right)

    expect(sent.map((m) => m.seq)).toEqual([1, 2, 3])
    const me = game.view.players.get('me')!
    let [x] = [-20]
    for (let i = 0; i < 3; i++) [x] = stepPlayer(x, 24, 1, 0, TICK_DT)
    expect(me.x).toBeCloseTo(x, 9)
    expect(game.pendingCount).toBe(3)
  })

  it('reconciles without visible correction when the server agrees', () => {
    const game = new ClientGame('me', roster, () => {})
    game.onSnapshot(snapshot(10, {}))
    game.update(TICK_DT * 4 + 1e-6, right)

    // Server processed inputs 1 and 2 exactly like the client did.
    let [x, z] = [-20, 24]
    for (let i = 0; i < 2; i++) [x, z] = stepPlayer(x, z, 1, 0, TICK_DT)
    game.onSnapshot(snapshot(12, { x, z, q: 2 }))

    expect(game.pendingCount).toBe(2)
    expect(game.corrections).toBe(0)
  })

  it('snaps back toward the server position when the prediction was wrong', () => {
    const game = new ClientGame('me', roster, () => {})
    game.onSnapshot(snapshot(10, {}))
    game.update(TICK_DT * 2 + 1e-6, right)
    // Server says we were pushed somewhere else and processed everything.
    game.onSnapshot(snapshot(12, { x: -10, z: 24, q: 2 }))
    expect(game.corrections).toBe(1)
    for (let i = 0; i < 60; i++) game.update(1 / 60, () => ({ mx: 0, mz: 0, aim: 0, fire: false }))
    expect(game.view.players.get('me')!.x).toBeCloseTo(-10, 2)
  })

  it('does not predict while dead or during the countdown', () => {
    const game = new ClientGame('me', roster, () => {})
    game.onSnapshot(snapshot(10, {}, 'countdown'))
    game.update(TICK_DT * 3 + 1e-6, right)
    expect(game.pendingCount).toBe(0)

    game.onSnapshot(snapshot(12, { al: false }))
    game.update(TICK_DT * 3 + 1e-6, right)
    expect(game.pendingCount).toBe(0)
  })
})
