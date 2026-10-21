// Client-side port of server/nexus/physics.py, used for movement prediction.
// It must stay bit-for-bit identical: both versions are tested against
// shared/movement_fixtures.json.
import { C, HALF } from './constants'

const R = C.playerRadius
const SPEED = C.playerSpeed

export function resolveCircle(x: number, z: number, r: number): [number, number] {
  for (let pass = 0; pass < 2; pass++) {
    for (const box of C.obstacles) {
      const cx = Math.min(Math.max(x, box.x - box.hx), box.x + box.hx)
      const cz = Math.min(Math.max(z, box.z - box.hz), box.z + box.hz)
      const dx = x - cx
      const dz = z - cz
      const d2 = dx * dx + dz * dz
      if (d2 >= r * r) continue
      if (d2 > 1e-12) {
        const d = Math.sqrt(d2)
        const push = r - d
        x += (dx / d) * push
        z += (dz / d) * push
      } else {
        const left = x - (box.x - box.hx)
        const right = box.x + box.hx - x
        const top = z - (box.z - box.hz)
        const bottom = box.z + box.hz - z
        const m = Math.min(left, right, top, bottom)
        if (m === left) x = box.x - box.hx - r
        else if (m === right) x = box.x + box.hx + r
        else if (m === top) z = box.z - box.hz - r
        else z = box.z + box.hz + r
      }
    }
    x = Math.min(Math.max(x, -HALF + r), HALF - r)
    z = Math.min(Math.max(z, -HALF + r), HALF - r)
  }
  return [x, z]
}

export function moveDirection(mx: number, mz: number): [number, number] {
  mx = Math.max(-1, Math.min(1, Math.trunc(mx)))
  mz = Math.max(-1, Math.min(1, Math.trunc(mz)))
  if (mx && mz) {
    const inv = 1 / Math.sqrt(2)
    return [mx * inv, mz * inv]
  }
  return [mx, mz]
}

export function stepPlayer(x: number, z: number, mx: number, mz: number, dt: number): [number, number] {
  const [dx, dz] = moveDirection(mx, mz)
  return resolveCircle(x + dx * SPEED * dt, z + dz * SPEED * dt, R)
}
