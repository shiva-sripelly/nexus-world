import type { ServerMessage } from './protocol'

type Listener = (msg: ServerMessage) => void

export function socketUrl(): string {
  const env = import.meta.env.VITE_WS_URL as string | undefined
  if (env) return env
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${location.host}/ws`
}

/** Thin WebSocket wrapper: JSON messages, listeners, and latency measurement. */
export class GameSocket {
  private ws: WebSocket | null = null
  private listeners = new Set<Listener>()
  private pingTimer: number | undefined
  onClose: (() => void) | null = null
  onPing: ((ms: number) => void) | null = null

  connect(hello: Record<string, unknown>): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(socketUrl())
      this.ws = ws
      ws.onopen = () => {
        ws.send(JSON.stringify({ t: 'hello', ...hello }))
        resolve()
      }
      ws.onerror = () => reject(new Error('Could not reach the game server.'))
      ws.onmessage = (ev) => {
        let msg: ServerMessage
        try {
          msg = JSON.parse(ev.data as string)
        } catch {
          return
        }
        if (msg.t === 'pong') this.onPing?.(Math.round(performance.now() - msg.ts))
        for (const l of this.listeners) l(msg)
      }
      ws.onclose = () => {
        window.clearInterval(this.pingTimer)
        if (this.ws === ws) this.ws = null
        this.onClose?.()
      }
      this.pingTimer = window.setInterval(() => this.send({ t: 'ping', ts: performance.now() }), 2000)
    })
  }

  get open(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  send(msg: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg))
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l)
    return () => this.listeners.delete(l)
  }

  close(): void {
    this.ws?.close()
  }
}

export const socket = new GameSocket()
