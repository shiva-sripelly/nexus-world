import { useFrame, useThree } from '@react-three/fiber'
import { Vector3 } from 'three'
import type { SceneSource } from './Entities'

export type TagRegistry = Map<string, HTMLDivElement>

const p = new Vector3()

/** Inside the Canvas: projects each player's head position to screen space
 *  and moves its DOM tag there. Mounted last so it runs after the camera rig. */
export function NameTagProjector({ source, tags }: { source: SceneSource; tags: TagRegistry }) {
  const { camera, size } = useThree()
  useFrame(() => {
    for (const [id, el] of tags) {
      const v = source.view.players.get(id)
      if (!v || !v.alive || !v.connected) {
        el.style.display = 'none'
        continue
      }
      p.set(v.x, 2.95, v.z).project(camera)
      if (p.z > 1) {
        el.style.display = 'none'
        continue
      }
      el.style.display = 'block'
      const x = ((p.x + 1) / 2) * size.width
      const y = ((1 - p.y) / 2) * size.height
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`
    }
  })
  return null
}

/** Outside the Canvas: plain DOM owned by React, so mounting and unmounting stay clean. */
export function NameTagLayer({ source, tags }: { source: SceneSource; tags: TagRegistry }) {
  const localId = source.live ? source.view.focusId : null
  return (
    <div className="nametags" aria-hidden="true">
      {[...source.roster.values()].map((r) => (
        <div
          key={r.id}
          ref={(el) => {
            if (el) tags.set(r.id, el)
            else tags.delete(r.id)
          }}
          className={r.id === localId ? 'nametag nametag--you' : 'nametag'}
          style={{ color: r.color, display: 'none' }}
        >
          {r.name}
        </div>
      ))}
    </div>
  )
}
