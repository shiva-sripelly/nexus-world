import { Canvas } from '@react-three/fiber'
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import { useMemo } from 'react'
import { Arena } from './Arena'
import { Bolts, CameraRig, Driver, Players, Sentinels, type SceneSource } from './Entities'
import { NameTagLayer, NameTagProjector, type TagRegistry } from './NameTags'

export function GameScene({ source }: { source: SceneSource }) {
  const tags = useMemo<TagRegistry>(() => new Map(), [])
  return (
    <>
      <Canvas
        className="game-canvas"
        dpr={[1, 1.75]}
        camera={{ fov: 50, position: [0, 21, 15], near: 0.1, far: 220 }}
        gl={{ antialias: false, powerPreference: 'high-performance' }}
      >
        <Driver source={source} />
        <CameraRig source={source} />
        <Arena />
        <Players source={source} />
        <Sentinels source={source} />
        <Bolts source={source} />
        <EffectComposer multisampling={4}>
          <Bloom mipmapBlur luminanceThreshold={0.9} luminanceSmoothing={0.2} intensity={1.15} />
          <Vignette eskil={false} offset={0.25} darkness={0.75} />
        </EffectComposer>
        <NameTagProjector source={source} tags={tags} />
      </Canvas>
      <NameTagLayer source={source} tags={tags} />
    </>
  )
}
