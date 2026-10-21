import { Canvas, useFrame } from '@react-three/fiber'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import { useRef } from 'react'
import type { Group } from 'three'
import { CharacterModel } from './Character'
import { NEON, NEON_ALT } from './neon'

function Spinner({ color, accessory }: { color: string; accessory: string }) {
  const ref = useRef<Group>(null)
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.8
  })
  return (
    <group ref={ref}>
      <CharacterModel color={color} accessory={accessory} highlight />
    </group>
  )
}

/** Live 3D preview of the player's character on the customization screen. */
export function CharacterPreview({ color, accessory }: { color: string; accessory: string }) {
  return (
    <Canvas className="preview-canvas" dpr={[1, 2]} camera={{ fov: 32, position: [0, 1.6, 5.2] }} onCreated={({ camera }) => camera.lookAt(0, 1.05, 0)}>
      <color attach="background" args={['#120d2e']} />
      <ambientLight intensity={0.7} color="#8b7cf6" />
      <directionalLight position={[3, 5, 4]} intensity={1.4} color="#e9d5ff" />
      <pointLight position={[-3, 2, -2]} intensity={25} color={NEON} />
      <pointLight position={[3, 1, -2]} intensity={18} color={NEON_ALT} />
      <Spinner color={color} accessory={accessory} />
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.6, 48]} />
        <meshStandardMaterial color="#1c1640" roughness={0.8} />
      </mesh>
      <EffectComposer multisampling={4}>
        <Bloom mipmapBlur luminanceThreshold={0.9} intensity={1.1} />
      </EffectComposer>
    </Canvas>
  )
}
