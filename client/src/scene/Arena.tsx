import { Edges, Grid } from '@react-three/drei'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { InstancedMesh, Object3D } from 'three'
import { C, HALF } from '../game/constants'
import { NEON, NEON_ALT, glow, mulberry32 } from './neon'

const WALL_HEIGHT = 7
const OBSTACLE_HEIGHT = 4.5

interface Strip {
  x: number
  y: number
  z: number
  sx: number
  sy: number
  sz: number
}

/** Circuit-board style light strips on the floor, walls and pillars, drawn as one InstancedMesh. */
function buildStrips(): Strip[] {
  const rand = mulberry32(42)
  const strips: Strip[] = []

  // Floor traces.
  for (let i = 0; i < 70; i++) {
    const x = (rand() * 2 - 1) * (HALF - 2)
    const z = (rand() * 2 - 1) * (HALF - 2)
    const len = 0.6 + rand() * 3.5
    const alongX = rand() > 0.5
    strips.push({ x, y: 0.02, z, sx: alongX ? len : 0.07, sy: 0.02, sz: alongX ? 0.07 : len })
  }

  // Wall circuitry on the inside face of each boundary wall.
  const faces: { axis: 'x' | 'z'; fixed: number; inward: number }[] = [
    { axis: 'x', fixed: -HALF, inward: 1 },
    { axis: 'x', fixed: HALF, inward: -1 },
    { axis: 'z', fixed: -HALF, inward: 1 },
    { axis: 'z', fixed: HALF, inward: -1 },
  ]
  for (const f of faces) {
    for (let i = 0; i < 46; i++) {
      const along = (rand() * 2 - 1) * (HALF - 1.5)
      const y = 0.6 + rand() * (WALL_HEIGHT - 1.2)
      const horizontal = rand() > 0.45
      const len = 0.4 + rand() * (horizontal ? 2.6 : 1.8)
      const depth = f.fixed + f.inward * 0.03
      if (f.axis === 'z') {
        strips.push({ x: along, y, z: depth, sx: horizontal ? len : 0.07, sy: horizontal ? 0.07 : len, sz: 0.02 })
      } else {
        strips.push({ x: depth, y, z: along, sx: 0.02, sy: horizontal ? 0.07 : len, sz: horizontal ? len : 0.07 })
      }
    }
  }

  // A few traces on every pillar face.
  for (const b of C.obstacles) {
    for (let i = 0; i < 8; i++) {
      const y = 0.5 + rand() * (OBSTACLE_HEIGHT - 1)
      const horizontal = rand() > 0.4
      const side = Math.floor(rand() * 4)
      if (side < 2) {
        const z = b.z + (side === 0 ? -b.hz - 0.02 : b.hz + 0.02)
        const x = b.x + (rand() * 2 - 1) * b.hx * 0.8
        const len = 0.3 + rand() * Math.min(1.6, b.hx)
        strips.push({ x, y, z, sx: horizontal ? len : 0.06, sy: horizontal ? 0.06 : len, sz: 0.02 })
      } else {
        const x = b.x + (side === 2 ? -b.hx - 0.02 : b.hx + 0.02)
        const z = b.z + (rand() * 2 - 1) * b.hz * 0.8
        const len = 0.3 + rand() * Math.min(1.6, b.hz)
        strips.push({ x, y, z, sx: 0.02, sy: horizontal ? 0.06 : len, sz: horizontal ? len : 0.06 })
      }
    }
  }
  return strips
}

function NeonStrips() {
  const ref = useRef<InstancedMesh>(null)
  const strips = useMemo(buildStrips, [])
  const color = useMemo(() => glow(NEON, 4), [])

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const o = new Object3D()
    strips.forEach((s, i) => {
      o.position.set(s.x, s.y, s.z)
      o.scale.set(s.sx, s.sy, s.sz)
      o.updateMatrix()
      mesh.setMatrixAt(i, o.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
  }, [strips])

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, strips.length]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial color={color} toneMapped={false} />
    </instancedMesh>
  )
}

export function Arena() {
  const size = HALF * 2
  const walls = [
    { pos: [0, WALL_HEIGHT / 2, -HALF - 0.5], size: [size + 2, WALL_HEIGHT, 1] },
    { pos: [0, WALL_HEIGHT / 2, HALF + 0.5], size: [size + 2, WALL_HEIGHT, 1] },
    { pos: [-HALF - 0.5, WALL_HEIGHT / 2, 0], size: [1, WALL_HEIGHT, size] },
    { pos: [HALF + 0.5, WALL_HEIGHT / 2, 0], size: [1, WALL_HEIGHT, size] },
  ] as const

  return (
    <group>
      <color attach="background" args={['#0d0a24']} />
      <fog attach="fog" args={['#0d0a24', 34, 90]} />
      <ambientLight intensity={0.5} color="#7c6cf0" />
      <hemisphereLight args={['#4b3a9a', '#0a0820', 0.7]} />
      <directionalLight position={[10, 24, 8]} intensity={0.8} color="#c4b5fd" />
      {[
        [-20, 5, -20],
        [20, 5, 20],
        [20, 5, -20],
        [-20, 5, 20],
      ].map((p, i) => (
        <pointLight key={i} position={p as [number, number, number]} intensity={45} distance={30} decay={1.6} color={i % 2 ? NEON : NEON_ALT} />
      ))}

      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[size, size]} />
        <meshStandardMaterial color="#171334" roughness={0.85} metalness={0.15} />
      </mesh>
      <Grid
        position={[0, 0.01, 0]}
        args={[size, size]}
        cellSize={1}
        cellThickness={0.5}
        cellColor="#2b2163"
        sectionSize={6}
        sectionThickness={1}
        sectionColor="#5b2bd9"
        fadeDistance={90}
        fadeStrength={1}
      />

      {walls.map((w, i) => (
        <mesh key={i} position={w.pos as unknown as [number, number, number]}>
          <boxGeometry args={w.size as unknown as [number, number, number]} />
          <meshStandardMaterial color="#1c1640" roughness={0.9} />
        </mesh>
      ))}

      {C.obstacles.map((b, i) => (
        <mesh key={i} position={[b.x, OBSTACLE_HEIGHT / 2, b.z]}>
          <boxGeometry args={[b.hx * 2, OBSTACLE_HEIGHT, b.hz * 2]} />
          <meshStandardMaterial color="#211a4a" roughness={0.8} />
          <Edges color={glow(NEON_ALT, 2.5)} />
        </mesh>
      ))}

      <NeonStrips />
    </group>
  )
}
