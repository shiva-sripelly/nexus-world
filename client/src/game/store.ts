import { create } from 'zustand'
import type {
  LobbyState,
  LobbySummary,
  ResultRow,
  RosterEntry,
  ServerMessage,
  Snapshot,
} from '../net/protocol'
import { socket } from '../net/socket'
import { ClientGame, type InputMessage } from './clientGame'
import { C, COLORS } from './constants'

export type Screen =
  | 'menu'
  | 'queue'
  | 'lobbies'
  | 'lobby'
  | 'game'
  | 'results'
  | 'leaderboard'
  | 'replays'
  | 'replay'

export interface Look {
  color: string
  accessory: string
}

export interface HudPlayer {
  id: string
  name: string
  color: string
  isBot: boolean
  score: number
  kills: number
  deaths: number
  hp: number
  alive: boolean
  connected: boolean
}

export interface Hud {
  phase: Snapshot['phase']
  timeLeft: number
  countdown: number
  standings: HudPlayer[]
  me: HudPlayer | null
  respawnAt: number | null
}

export interface FeedItem {
  id: number
  killer: { name: string; color: string } | null
  victim: { name: string; color: string }
  sentinel: boolean
  at: number
}

interface State {
  screen: Screen
  connecting: boolean
  profile: { id: string; name: string; rating: number; rank: number | null } | null
  look: Look
  error: string | null
  lobbies: LobbySummary[]
  lobby: LobbyState | null
  queue: { inQueue: number; waited: number; botsIn: number } | null
  match: { matchId: string; mode: string; you: string; roster: RosterEntry[] } | null
  hud: Hud | null
  feed: FeedItem[]
  results: { matchId: string; mode: string; results: ResultRow[]; replayId: string } | null
  ping: number | null
  replayId: string | null
}

const LOOK_KEY = 'nexus:look'
const tokenKey = (name: string) => `nexus:token:${name.toLowerCase()}`

function loadLook(): Look {
  try {
    const saved = JSON.parse(localStorage.getItem(LOOK_KEY) ?? 'null')
    if (saved && COLORS.includes(saved.color) && C.accessories.includes(saved.accessory)) return saved
  } catch {
    /* ignore */
  }
  return { color: COLORS[1], accessory: 'visor' }
}

/** The live match lives outside React state: it changes every frame. */
export let liveGame: ClientGame | null = null
let feedId = 0

export const useGame = create<State>(() => ({
  screen: 'menu',
  connecting: false,
  profile: null,
  look: loadLook(),
  error: null,
  lobbies: [],
  lobby: null,
  queue: null,
  match: null,
  hud: null,
  feed: [],
  results: null,
  ping: null,
  replayId: null,
}))

const set = useGame.setState
const get = useGame.getState

function buildHud(s: Snapshot, roster: Map<string, RosterEntry>, you: string, prev: Hud | null): Hud {
  const standings: HudPlayer[] = s.players
    .map((p) => {
      const r = roster.get(p.id)
      return {
        id: p.id,
        name: r?.name ?? '?',
        color: r?.color ?? '#fff',
        isBot: r?.is_bot ?? false,
        score: p.s,
        kills: p.k,
        deaths: p.d,
        hp: p.hp,
        alive: p.al,
        connected: p.on,
      }
    })
    .sort((a, b) => b.score - a.score || b.kills - a.kills || a.deaths - b.deaths)
  const me = standings.find((p) => p.id === you) ?? null
  let respawnAt = prev?.respawnAt ?? null
  if (me && !me.alive && prev?.me?.alive !== false) respawnAt = performance.now() + C.respawnSeconds * 1000
  if (me?.alive) respawnAt = null
  return { phase: s.phase, timeLeft: s.timeLeft, countdown: s.countdown, standings, me, respawnAt }
}

export function feedFromEvents(events: Snapshot['events'], roster: Map<string, RosterEntry>): FeedItem[] {
  const who = (id: string | null) => {
    const r = id ? roster.get(id) : undefined
    return r ? { name: r.name, color: r.color } : null
  }
  const items: FeedItem[] = []
  for (const e of events) {
    if (e.type === 'kill') {
      const victim = who(e.victim)
      if (victim) items.push({ id: ++feedId, killer: who(e.killer), victim, sentinel: !e.killer, at: performance.now() })
    }
  }
  return items
}

function onMessage(msg: ServerMessage): void {
  switch (msg.t) {
    case 'welcome': {
      if (msg.token) localStorage.setItem(tokenKey(msg.name), msg.token)
      set({ profile: { id: msg.id, name: msg.name, rating: msg.rating, rank: msg.rank }, connecting: false })
      break
    }
    case 'error':
      set({ error: msg.message, connecting: false })
      break
    case 'lobbies':
      set({ lobbies: msg.lobbies })
      break
    case 'lobby': {
      const { t: _t, ...lobby } = msg
      set({ lobby, screen: get().screen === 'game' || get().screen === 'results' ? get().screen : 'lobby' })
      break
    }
    case 'lobby_left':
      set({ lobby: null, screen: 'menu' })
      break
    case 'queue_status':
      set({ queue: { inQueue: msg.inQueue, waited: msg.waited, botsIn: msg.botsIn }, screen: 'queue' })
      break
    case 'queue_left':
      set({ queue: null, screen: 'menu' })
      break
    case 'match_start': {
      liveGame = new ClientGame(msg.you, msg.roster, (m: InputMessage) => socket.send({ ...m }))
      set({
        match: { matchId: msg.matchId, mode: msg.mode, you: msg.you, roster: msg.roster },
        queue: null,
        hud: null,
        feed: [],
        results: null,
        screen: 'game',
      })
      break
    }
    case 'snap': {
      const game = liveGame
      const match = get().match
      if (!game || !match) return
      game.onSnapshot(msg)
      const items = feedFromEvents(msg.events, game.roster)
      const now = performance.now()
      set((s) => ({
        hud: buildHud(msg, game.roster, match.you, s.hud),
        feed: items.length || s.feed.some((f) => now - f.at > 5000) ? [...s.feed, ...items].filter((f) => now - f.at < 5000).slice(-5) : s.feed,
      }))
      break
    }
    case 'match_end': {
      liveGame = null
      const mine = msg.results.find((r) => r.id === get().profile?.id)
      set((s) => ({
        results: { matchId: msg.matchId, mode: msg.mode, results: msg.results, replayId: msg.replayId },
        profile: s.profile && mine ? { ...s.profile, rating: mine.ratingAfter } : s.profile,
        screen: 'results',
        match: null,
      }))
      break
    }
    case 'left_match':
      liveGame = null
      set({ match: null, hud: null, screen: get().lobby ? 'lobby' : 'menu' })
      break
  }
}

socket.subscribe(onMessage)
socket.onPing = (ms) => set({ ping: ms })
socket.onClose = () => {
  liveGame = null
  set((s) => ({
    connecting: false,
    profile: null,
    lobby: null,
    queue: null,
    match: null,
    screen: s.screen === 'leaderboard' || s.screen === 'replays' || s.screen === 'replay' ? s.screen : 'menu',
    error: s.profile ? 'Disconnected from the server.' : s.error,
  }))
}

export const actions = {
  async login(name: string) {
    set({ connecting: true, error: null })
    const { look } = get()
    try {
      await socket.connect({ name, token: localStorage.getItem(tokenKey(name)), ...look })
    } catch (e) {
      set({ connecting: false, error: (e as Error).message })
    }
  },
  setLook(look: Partial<Look>) {
    const next = { ...get().look, ...look }
    localStorage.setItem(LOOK_KEY, JSON.stringify(next))
    set({ look: next })
    socket.send({ t: 'update_look', ...next })
  },
  quickMatch: () => socket.send({ t: 'queue' }),
  cancelQueue: () => socket.send({ t: 'cancel_queue' }),
  browseLobbies() {
    set({ screen: 'lobbies' })
    socket.send({ t: 'list_lobbies' })
  },
  refreshLobbies: () => socket.send({ t: 'list_lobbies' }),
  createLobby: () => socket.send({ t: 'create_lobby' }),
  joinLobby: (id: string) => socket.send({ t: 'join_lobby', id }),
  leaveLobby: () => socket.send({ t: 'leave_lobby' }),
  toggleReady: () => socket.send({ t: 'toggle_ready' }),
  addBot: () => socket.send({ t: 'add_bot' }),
  removeBot: (id: string) => socket.send({ t: 'remove_bot', id }),
  startMatch: () => socket.send({ t: 'start_match' }),
  leaveMatch: () => socket.send({ t: 'leave_match' }),
  goto: (screen: Screen) => set({ screen, error: null }),
  backFromResults: () => set({ screen: get().lobby ? 'lobby' : 'menu', results: null }),
  openReplay: (replayId: string) => set({ replayId, screen: 'replay' }),
  dismissError: () => set({ error: null }),
}
