// Snapshot buffering and interpolation shared by live play and replays.
import type { SnapBolt, SnapEnemy, Snapshot } from '../net/protocol'

export interface PlayerView {
  id: string
  x: number
  z: number
  a: number
  hp: number
  alive: boolean
  protected: boolean
  connected: boolean
  score: number
  kills: number
  deaths: number
}

export interface View {
  players: Map<string, PlayerView>
  enemies: SnapEnemy[]
  bolts: SnapBolt[]
  focusId: string | null
}

export function createView(): View {
  return { players: new Map(), enemies: [], bolts: [], focusId: null }
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return a + d * t
}

const TELEPORT = 3 // a jump this large between snapshots is a respawn, not movement

/** Write the state between snapshots `a` and `b` (t in [0, 1]) into `out`. */
export function interpolate(a: Snapshot, b: Snapshot, t: number, out: View): void {
  const prevPlayers = new Map(a.players.map((p) => [p.id, p]))
  const seen = new Set<string>()
  for (const pb of b.players) {
    const pa = prevPlayers.get(pb.id) ?? pb
    const jump = Math.hypot(pb.x - pa.x, pb.z - pa.z) > TELEPORT
    const v = out.players.get(pb.id) ?? ({ id: pb.id } as PlayerView)
    v.x = jump ? pb.x : lerp(pa.x, pb.x, t)
    v.z = jump ? pb.z : lerp(pa.z, pb.z, t)
    v.a = lerpAngle(pa.a, pb.a, t)
    v.hp = pb.hp
    v.alive = pb.al
    v.protected = pb.pr
    v.connected = pb.on
    v.score = pb.s
    v.kills = pb.k
    v.deaths = pb.d
    out.players.set(pb.id, v)
    seen.add(pb.id)
  }
  for (const id of out.players.keys()) if (!seen.has(id)) out.players.delete(id)

  const prevEnemies = new Map(a.enemies.map((e) => [e.id, e]))
  out.enemies = b.enemies.map((eb) => {
    const ea = prevEnemies.get(eb.id) ?? eb
    return { id: eb.id, hp: eb.hp, x: lerp(ea.x, eb.x, t), z: lerp(ea.z, eb.z, t) }
  })

  const prevBolts = new Map(a.bolts.map((bl) => [bl.id, bl]))
  out.bolts = b.bolts.map((bb) => {
    const ba = prevBolts.get(bb.id) ?? bb
    return { id: bb.id, o: bb.o, x: lerp(ba.x, bb.x, t), z: lerp(ba.z, bb.z, t) }
  })
}

/** Keeps recent snapshots ordered by server tick and samples them at any tick. */
export class SnapshotBuffer {
  private snaps: Snapshot[] = []

  constructor(private capacity = 60) {}

  push(s: Snapshot): void {
    const last = this.snaps[this.snaps.length - 1]
    if (last && s.tick <= last.tick) return // out of order or duplicate
    this.snaps.push(s)
    if (this.snaps.length > this.capacity) this.snaps.shift()
  }

  get latest(): Snapshot | undefined {
    return this.snaps[this.snaps.length - 1]
  }

  get size(): number {
    return this.snaps.length
  }

  sample(tick: number, out: View): Snapshot | undefined {
    const s = this.snaps
    if (s.length === 0) return undefined
    if (s.length === 1 || tick <= s[0].tick) {
      interpolate(s[0], s[0], 0, out)
      return s[0]
    }
    for (let i = s.length - 2; i >= 0; i--) {
      if (s[i].tick <= tick) {
        const a = s[i]
        const b = s[i + 1]
        const t = Math.min(1, (tick - a.tick) / (b.tick - a.tick))
        interpolate(a, b, t, out)
        return b
      }
    }
    const last = s[s.length - 1]
    interpolate(last, last, 0, out)
    return last
  }
}
