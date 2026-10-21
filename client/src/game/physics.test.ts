import { describe, expect, it } from 'vitest'
import fixtures from '../../../shared/movement_fixtures.json'
import { C, TICK_DT } from './constants'
import { moveDirection, stepPlayer } from './physics'

describe('client prediction physics', () => {
  it('matches the server on every shared fixture', () => {
    expect(fixtures.dt).toBeCloseTo(TICK_DT, 12)
    for (const c of fixtures.cases) {
      let x = c.x
      let z = c.z
      for (const [mx, mz] of c.steps) [x, z] = stepPlayer(x, z, mx, mz, fixtures.dt)
      expect(x).toBeCloseTo(c.expected[0], 10)
      expect(z).toBeCloseTo(c.expected[1], 10)
    }
  })

  it('normalizes diagonal movement', () => {
    const [dx, dz] = moveDirection(1, -1)
    expect(Math.hypot(dx, dz)).toBeCloseTo(1, 12)
  })

  it('moves speed * dt in a straight line', () => {
    const [x] = stepPlayer(-20, 24, 1, 0, TICK_DT)
    expect(x).toBeCloseTo(-20 + C.playerSpeed * TICK_DT, 12)
  })
})
