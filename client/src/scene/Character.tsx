import { forwardRef, useMemo } from 'react'
import { DoubleSide, Group } from 'three'
import { glow } from './neon'

const SKIN = '#7dd3fc'
const HAIR = '#22d3ee'
const PANTS = '#2b2d42'
const CLOAK = '#3d3150'

export interface CharacterParts {
  root: Group | null
  legL: Group | null
  legR: Group | null
}

interface Props {
  color: string
  accessory: string
  parts?: CharacterParts
  highlight?: boolean
}

/** Low-poly stylised character built from primitives. Faces +Z. */
export const CharacterModel = forwardRef<Group, Props>(function CharacterModel({ color, accessory, parts, highlight }, ref) {
  const glowColor = useMemo(() => glow(color, 3), [color])
  const ringColor = useMemo(() => glow(color, highlight ? 3.5 : 2), [color, highlight])

  return (
    <group ref={ref}>
      {/* ground ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <ringGeometry args={[0.62, highlight ? 0.85 : 0.75, 40]} />
        <meshBasicMaterial color={ringColor} toneMapped={false} transparent opacity={0.85} side={DoubleSide} />
      </mesh>

      {/* legs */}
      <group
        ref={(g) => {
          if (parts) parts.legL = g
        }}
        position={[-0.15, 0.82, 0]}
      >
        <mesh position={[0, -0.41, 0]}>
          <boxGeometry args={[0.22, 0.82, 0.26]} />
          <meshStandardMaterial color={PANTS} roughness={0.8} />
        </mesh>
      </group>
      <group
        ref={(g) => {
          if (parts) parts.legR = g
        }}
        position={[0.15, 0.82, 0]}
      >
        <mesh position={[0, -0.41, 0]}>
          <boxGeometry args={[0.22, 0.82, 0.26]} />
          <meshStandardMaterial color={PANTS} roughness={0.8} />
        </mesh>
      </group>

      {/* jacket */}
      <mesh position={[0, 1.18, 0]}>
        <capsuleGeometry args={[0.32, 0.42, 6, 12]} />
        <meshStandardMaterial color={color} roughness={0.55} />
      </mesh>
      {/* cloak */}
      <mesh position={[0, 1.08, -0.3]} rotation={[0.12, 0, 0]}>
        <boxGeometry args={[0.72, 0.95, 0.06]} />
        <meshStandardMaterial color={CLOAK} roughness={0.9} />
      </mesh>
      {/* arms */}
      <mesh position={[-0.43, 1.12, 0]}>
        <boxGeometry args={[0.16, 0.6, 0.18]} />
        <meshStandardMaterial color={color} roughness={0.55} />
      </mesh>
      <mesh position={[0.43, 1.12, 0.08]} rotation={[-0.9, 0, 0]}>
        <boxGeometry args={[0.16, 0.6, 0.18]} />
        <meshStandardMaterial color={color} roughness={0.55} />
      </mesh>
      {/* blaster */}
      <mesh position={[0.43, 0.98, 0.42]}>
        <boxGeometry args={[0.13, 0.13, 0.42]} />
        <meshStandardMaterial color="#1e1b2e" roughness={0.4} metalness={0.6} />
      </mesh>
      <mesh position={[0.43, 0.98, 0.65]}>
        <sphereGeometry args={[0.07, 10, 10]} />
        <meshBasicMaterial color={glowColor} toneMapped={false} />
      </mesh>

      {/* head and hair */}
      <mesh position={[0, 1.7, 0]}>
        <sphereGeometry args={[0.25, 16, 16]} />
        <meshStandardMaterial color={SKIN} roughness={0.6} />
      </mesh>
      {[-0.14, 0, 0.14].map((x, i) => (
        <mesh key={i} position={[x, 1.92, -0.04]} rotation={[-0.35, 0, -x * 2.2]}>
          <coneGeometry args={[0.1, 0.26, 6]} />
          <meshStandardMaterial color={HAIR} roughness={0.5} />
        </mesh>
      ))}

      {accessory === 'visor' && (
        <mesh position={[0, 1.72, 0.2]}>
          <boxGeometry args={[0.44, 0.09, 0.1]} />
          <meshBasicMaterial color={glow('#67e8f9', 3)} toneMapped={false} />
        </mesh>
      )}
      {accessory === 'horns' &&
        [-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.17, 1.9, 0.05]} rotation={[0, 0, -s * 0.5]}>
            <coneGeometry args={[0.06, 0.28, 8]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.4} />
          </mesh>
        ))}
      {accessory === 'antenna' && (
        <group position={[0.1, 1.95, 0]}>
          <mesh position={[0, 0.17, 0]}>
            <cylinderGeometry args={[0.02, 0.02, 0.35, 6]} />
            <meshStandardMaterial color="#cbd5e1" />
          </mesh>
          <mesh position={[0, 0.38, 0]}>
            <sphereGeometry args={[0.07, 10, 10]} />
            <meshBasicMaterial color={glowColor} toneMapped={false} />
          </mesh>
        </group>
      )}
      {accessory === 'halo' && (
        <mesh position={[0, 2.12, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.24, 0.03, 8, 32]} />
          <meshBasicMaterial color={glow('#fde047', 3)} toneMapped={false} />
        </mesh>
      )}
    </group>
  )
})
