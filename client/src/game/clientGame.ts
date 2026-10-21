// Live match state on the client: client-side prediction for the local player,
// server reconciliation, and interpolation for everything else.
import type { RosterEntry, Snapshot } from '../net/protocol'
import { TICK_DT, TICK_RATE } from './constants'
import type { InputSample } from './input'
import { stepPlayer } from './physics'
import { SnapshotBuffer, createView, type View } from './view'

/** Render other entities this many ticks in the past (2 snapshots ≈ 133 ms). */
export const INTERP_TICKS = 4
const MAX_STEPS_PER_FRAME = 4

interface PendingInput {
  seq: number
  mx: number
  mz: number
}

export interface InputMessage extends InputSample {
  t: 'input'
  seq: number
}

export class ClientGame {
  readonly roster: Map<string, RosterEntry>
  readonly view: View = createView()
  readonly buffer = new SnapshotBuffer()
  latest: Snapshot | null = null

  private clock = 0 // render time, in (fractional) server ticks
  private seq = 0
  private acc = 0
  private pending: PendingInput[] = []
  private predicted: { x: number; z: number } | null = null
  private offset = { x: 0, z: 0 } // visual smoothing of reconciliation errors
  private canPredict = false
  private localAim = 0
  corrections = 0

  constructor(
    readonly you: string,
    roster: RosterEntry[],
    private send: (msg: InputMessage) => void,
  ) {
    this.roster = new Map(roster.map((r) => [r.id, r]))
    this.view.focusId = you
  }

  onSnapshot(s: Snapshot): void {
    const first = this.buffer.size === 0
    this.buffer.push(s)
    this.latest = s
    if (first) this.clock = s.tick - INTERP_TICKS

    const me = s.players.find((p) => p.id === this.you)
    if (!me) return
    this.canPredict = me.al && s.phase === 'playing'
    const acked = me.q ?? 0
    this.pending = this.pending.filter((p) => p.seq > acked)

    if (!this.canPredict) {
      this.predicted = { x: me.x, z: me.z }
      this.offset = { x: 0, z: 0 }
      this.pending = []
      return
    }

    // Reconcile: start from the authoritative position and replay the inputs
    // the server has not processed yet.
    let x = me.x
    let z = me.z
    for (const p of this.pending) [x, z] = stepPlayer(x, z, p.mx, p.mz, TICK_DT)
    if (this.predicted) {
      const ex = this.predicted.x + this.offset.x - x
      const ez = this.predicted.z + this.offset.z - z
      if (Math.hypot(ex, ez) > 0.01) this.corrections++
      // Big errors (respawn, teleport) snap; small ones are smoothed out.
      this.offset = Math.hypot(ex, ez) > 2 ? { x: 0, z: 0 } : { x: ex, z: ez }
    }
    this.predicted = { x, z }
  }

  /** Call once per rendered frame. */
  update(frameDt: number, sample: () => InputSample): void {
    frameDt = Math.min(frameDt, 0.25)
    const latest = this.buffer.latest
    if (!latest) return

    // Advance the render clock and keep it INTERP_TICKS behind the newest snapshot.
    this.clock += frameDt * TICK_RATE
    const target = latest.tick - INTERP_TICKS
    const drift = target - this.clock
    this.clock = Math.abs(drift) > 10 ? target : this.clock + drift * 0.05

    // Fixed-rate input: one input per server tick, predicted locally.
    this.acc += frameDt
    let steps = 0
    while (this.acc >= TICK_DT && steps < MAX_STEPS_PER_FRAME) {
      this.acc -= TICK_DT
      steps++
      const input = sample()
      this.localAim = input.aim
      const msg: InputMessage = { t: 'input', seq: ++this.seq, ...input }
      this.send(msg)
      if (this.canPredict && this.predicted) {
        const [x, z] = stepPlayer(this.predicted.x, this.predicted.z, input.mx, input.mz, TICK_DT)
        this.predicted = { x, z }
        this.pending.push({ seq: msg.seq, mx: input.mx, mz: input.mz })
      }
    }
    if (steps === MAX_STEPS_PER_FRAME) this.acc = 0

    const decay = Math.exp(-frameDt * 12)
    this.offset.x *= decay
    this.offset.z *= decay

    this.buffer.sample(this.clock, this.view)

    // The local player is drawn at its predicted position, not the delayed one.
    const me = this.view.players.get(this.you)
    if (me && this.canPredict && this.predicted) {
      me.x = this.predicted.x + this.offset.x
      me.z = this.predicted.z + this.offset.z
      me.a = this.localAim
    }
  }

  get pendingCount(): number {
    return this.pending.length
  }
}
