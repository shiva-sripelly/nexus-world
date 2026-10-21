import { Billboard } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { Color, Group, InstancedMesh, Mesh, MeshBasicMaterial, Object3D, Plane, Raycaster, Vector3 } from 'three'
import { C } from '../game/constants'
import { aim } from '../game/input'
import type { View } from '../game/view'
import type { RosterEntry } from '../net/protocol'
import { CharacterModel, type CharacterParts } from './Character'
import { SENTINEL, glow } from './neon'

export interface SceneSource {
  view: View
  roster: Map<string, RosterEntry>
  update: (dt: number) => void
  /** Live play: raycast the mouse to aim. Replays leave it off. */
  live: boolean
}

export const stats = { fps: 0 }

const floor = new Plane(new Vector3(0, 1, 0), 0)
const hit = new Vector3()
const raycaster = new Raycaster()

/** Runs before everything else each frame: aim, then advance the game state. */
export function Driver({ source }: { source: SceneSource }) {
  const frames = useRef({ n: 0, t: 0 })
  useFrame((state, dt) => {
    if (source.live) {
      raycaster.setFromCamera(state.pointer, state.camera)
      const me = source.view.focusId ? source.view.players.get(source.view.focusId) : undefined
      if (me && raycaster.ray.intersectPlane(floor, hit)) {
        aim.angle = Math.atan2(hit.z - me.z, hit.x - me.x)
      }
    }
    source.update(dt)
    const f = frames.current
    f.n++
    f.t += dt
    if (f.t >= 0.5) {
      stats.fps = Math.round(f.n / f.t)
      f.n = 0
      f.t = 0
    }
  }, -1)
  return null
}

export function CameraRig({ source }: { source: SceneSource }) {
  const target = useRef(new Vector3())
  const { camera } = useThree()
  useFrame((_, dt) => {
    const id = source.view.focusId
    const me = id ? source.view.players.get(id) : undefined
    const goal = me ? new Vector3(me.x, 0, me.z) : new Vector3(0, 0, 0)
    target.current.lerp(goal, 1 - Math.exp(-dt * 8))
    const t = target.current
    camera.position.set(t.x, 21, t.z + 15)
    camera.lookAt(t.x, 0, t.z)
  })
  return null
}

const HP_COLORS = { high: new Color('#4ade80'), mid: new Color('#facc15'), low: new Color('#f43f5e') }

function PlayerAvatar({ entry, source, isLocal }: { entry: RosterEntry; source: SceneSource; isLocal: boolean }) {
  const group = useRef<Group>(null)
  const model = useRef<Group>(null)
  const hpBar = useRef<Mesh>(null)
  const parts = useMemo<CharacterParts>(() => ({ root: null, legL: null, legR: null }), [])
  const motion = useRef({ x: 0, z: 0, phase: 0, swing: 0, init: false })
  const aimColor = useMemo(() => glow(entry.color, 2), [entry.color])

  useFrame((state, dt) => {
    const g = group.current
    const v = source.view.players.get(entry.id)
    if (!g || !model.current) return
    const visible = !!v && v.alive && v.connected
    g.visible = visible
    if (!v || !visible) return

    const m = motion.current
    if (!m.init) {
      m.x = v.x
      m.z = v.z
      m.init = true
    }
    const speed = Math.hypot(v.x - m.x, v.z - m.z) / Math.max(dt, 1e-3)
    m.x = v.x
    m.z = v.z
    g.position.set(v.x, 0, v.z)
    model.current.rotation.y = Math.PI / 2 - v.a

    const moving = speed > 0.8 && speed < 40
    m.phase += dt * (moving ? 11 : 0)
    m.swing += ((moving ? Math.sin(m.phase) * 0.7 : 0) - m.swing) * Math.min(1, dt * 14)
    if (parts.legL) parts.legL.rotation.x = m.swing
    if (parts.legR) parts.legR.rotation.x = -m.swing
    model.current.position.y = moving ? Math.abs(Math.sin(m.phase)) * 0.07 : 0
    model.current.visible = !v.protected || Math.floor(state.clock.elapsedTime * 12) % 2 === 0

    if (hpBar.current) {
      const ratio = Math.max(0, v.hp / C.playerMaxHp)
      hpBar.current.scale.x = Math.max(0.001, ratio)
      hpBar.current.position.x = -(1 - ratio) * 0.6
      const mat = hpBar.current.material as MeshBasicMaterial
      mat.color.copy(ratio > 0.6 ? HP_COLORS.high : ratio > 0.3 ? HP_COLORS.mid : HP_COLORS.low)
    }
  }, -0.5) // after the Driver, before the camera and name tags

  return (
    <group ref={group}>
      <group ref={model}>
        <CharacterModel color={entry.color} accessory={entry.accessory} parts={parts} highlight={isLocal} />
        {isLocal && (
          <mesh position={[0, 0.05, 2.5]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.07, 3.4]} />
            <meshBasicMaterial color={aimColor} toneMapped={false} transparent opacity={0.45} />
          </mesh>
        )}
      </group>
      <Billboard position={[0, 2.55, 0]}>
        <mesh position={[0, 0, -0.01]}>
          <planeGeometry args={[1.28, 0.16]} />
          <meshBasicMaterial color="#0b0820" transparent opacity={0.8} />
        </mesh>
        <mesh ref={hpBar}>
          <planeGeometry args={[1.2, 0.1]} />
          <meshBasicMaterial color="#4ade80" toneMapped={false} />
        </mesh>
      </Billboard>
    </group>
  )
}

export function Players({ source }: { source: SceneSource }) {
  const entries = [...source.roster.values()]
  return (
    <>
      {entries.map((e) => (
        <PlayerAvatar key={e.id} entry={e} source={source} isLocal={source.live && e.id === source.view.focusId} />
      ))}
    </>
  )
}

const SENTINEL_POOL = C.enemyMaxAlive + 2

export function Sentinels({ source }: { source: SceneSource }) {
  const groups = useRef<(Group | null)[]>([])
  const core = useMemo(() => glow(SENTINEL, 2.2), [])
  const ring = useMemo(() => glow('#ff8fab', 3), [])

  useFrame((state) => {
    const t = state.clock.elapsedTime
    const enemies = source.view.enemies
    groups.current.forEach((g, i) => {
      if (!g) return
      const e = enemies[i]
      g.visible = !!e
      if (!e) return
      g.position.set(e.x, 1.25 + Math.sin(t * 2.4 + i) * 0.18, e.z)
      g.rotation.y = t * 1.6 + i
      g.scale.setScalar(0.7 + 0.3 * (e.hp / C.enemyMaxHp))
    })
  })

  return (
    <>
      {Array.from({ length: SENTINEL_POOL }, (_, i) => (
        <group
          key={i}
          ref={(g) => {
            groups.current[i] = g
          }}
          visible={false}
        >
          <mesh>
            <octahedronGeometry args={[0.6, 0]} />
            <meshStandardMaterial color="#3b0a1a" emissive={core} emissiveIntensity={1} roughness={0.3} flatShading />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.95, 0.04, 8, 40]} />
            <meshBasicMaterial color={ring} toneMapped={false} />
          </mesh>
          <pointLight intensity={6} distance={5} color={SENTINEL} />
        </group>
      ))}
    </>
  )
}

const MAX_BOLTS = 160

export function Bolts({ source }: { source: SceneSource }) {
  const mesh = useRef<InstancedMesh>(null)
  const dummy = useMemo(() => new Object3D(), [])
  const colors = useMemo(() => {
    const map = new Map<string, Color>()
    for (const r of source.roster.values()) map.set(r.id, glow(r.color, 5))
    return map
  }, [source.roster])
  const fallback = useMemo(() => glow('#ffffff', 4), [])

  useLayoutEffect(() => {
    const m = mesh.current
    if (!m) return
    for (let i = 0; i < MAX_BOLTS; i++) m.setColorAt(i, fallback)
    m.count = 0
  }, [fallback])

  useFrame(() => {
    const m = mesh.current
    if (!m) return
    const bolts = source.view.bolts
    const n = Math.min(bolts.length, MAX_BOLTS)
    for (let i = 0; i < n; i++) {
      const b = bolts[i]
      dummy.position.set(b.x, 1.0, b.z)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
      m.setColorAt(i, colors.get(b.o) ?? fallback)
    }
    m.count = n
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  })

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, MAX_BOLTS]} frustumCulled={false}>
      <sphereGeometry args={[0.2, 10, 10]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  )
}
