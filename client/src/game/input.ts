// Keyboard and mouse state. The aim angle is written by the scene each frame
// (it raycasts the mouse onto the arena floor).

const keys = new Set<string>()
let mouseDown = false
let enabled = false

export const aim = { angle: 0 }

function onKeyDown(e: KeyboardEvent) {
  if (!enabled) return
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault()
  keys.add(e.code)
}
const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code)
const onMouseDown = (e: MouseEvent) => {
  if (enabled && e.button === 0 && (e.target as HTMLElement)?.tagName === 'CANVAS') mouseDown = true
}
const onMouseUp = () => (mouseDown = false)
const onBlur = () => {
  keys.clear()
  mouseDown = false
}

export function enableInput(): () => void {
  enabled = true
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('mousedown', onMouseDown)
  window.addEventListener('mouseup', onMouseUp)
  window.addEventListener('blur', onBlur)
  return () => {
    enabled = false
    onBlur()
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('mousedown', onMouseDown)
    window.removeEventListener('mouseup', onMouseUp)
    window.removeEventListener('blur', onBlur)
  }
}

export interface InputSample {
  mx: number
  mz: number
  aim: number
  fire: boolean
}

export function sampleInput(): InputSample {
  const left = keys.has('KeyA') || keys.has('ArrowLeft')
  const right = keys.has('KeyD') || keys.has('ArrowRight')
  const up = keys.has('KeyW') || keys.has('ArrowUp')
  const down = keys.has('KeyS') || keys.has('ArrowDown')
  return {
    mx: (right ? 1 : 0) - (left ? 1 : 0),
    mz: (down ? 1 : 0) - (up ? 1 : 0),
    aim: aim.angle,
    fire: mouseDown || keys.has('Space'),
  }
}
