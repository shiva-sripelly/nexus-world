import type { GameEvent, ReplayFile, RosterEntry, Snapshot } from '../net/protocol'
import { TICK_RATE } from './constants'
import { SnapshotBuffer, createView, type View } from './view'

/** Plays back a recorded match using the same interpolation as live play. */
export class ReplayPlayer {
  readonly roster: Map<string, RosterEntry>
  readonly view: View = createView()
  readonly frames: Snapshot[]
  readonly firstTick: number
  readonly lastTick: number
  private buffer: SnapshotBuffer
  clock: number
  speed = 1
  playing = true
  private lastIndex = -1

  constructor(replay: ReplayFile) {
    this.roster = new Map(replay.header.roster.map((r) => [r.id, r]))
    this.frames = replay.frames
    this.firstTick = this.frames[0]?.tick ?? 0
    this.lastTick = this.frames[this.frames.length - 1]?.tick ?? 0
    this.buffer = new SnapshotBuffer(this.frames.length + 1)
    for (const f of this.frames) this.buffer.push(f)
    this.clock = this.firstTick
    this.view.focusId = replay.header.roster.find((r) => !r.is_bot)?.id ?? replay.header.roster[0]?.id ?? null
  }

  get progress(): number {
    return this.lastTick === this.firstTick ? 1 : (this.clock - this.firstTick) / (this.lastTick - this.firstTick)
  }

  seek(progress: number): void {
    this.clock = this.firstTick + Math.max(0, Math.min(1, progress)) * (this.lastTick - this.firstTick)
    this.lastIndex = this.indexAt(this.clock)
  }

  private indexAt(tick: number): number {
    let i = 0
    while (i + 1 < this.frames.length && this.frames[i + 1].tick <= tick) i++
    return i
  }

  /** Advance playback. Returns the events of every frame crossed this update. */
  update(frameDt: number): { snapshot: Snapshot | undefined; events: GameEvent[] } {
    if (this.playing) {
      this.clock = Math.min(this.lastTick, this.clock + Math.min(frameDt, 0.25) * TICK_RATE * this.speed)
      if (this.clock >= this.lastTick) this.playing = false
    }
    const snapshot = this.buffer.sample(this.clock, this.view)
    const index = this.indexAt(this.clock)
    const events: GameEvent[] = []
    for (let i = this.lastIndex + 1; i <= index && i >= 0; i++) events.push(...(this.frames[i]?.events ?? []))
    this.lastIndex = index
    return { snapshot, events }
  }
}
