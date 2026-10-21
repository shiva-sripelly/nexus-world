// Message shapes exchanged with the server (see server/nexus/hub.py and sim.py).

export interface RosterEntry {
  id: string
  name: string
  color: string
  accessory: string
  is_bot: boolean
}

export interface SnapPlayer {
  id: string
  x: number
  z: number
  a: number
  hp: number
  al: boolean
  pr: boolean
  s: number
  k: number
  d: number
  q?: number
  on: boolean
}

export interface SnapEnemy {
  id: string
  x: number
  z: number
  hp: number
}

export interface SnapBolt {
  id: number
  x: number
  z: number
  o: string
}

export type GameEvent =
  | { type: 'kill'; killer: string | null; victim: string }
  | { type: 'sentinel_down'; by: string }

export interface Snapshot {
  tick: number
  phase: 'countdown' | 'playing' | 'ended'
  timeLeft: number
  countdown: number
  players: SnapPlayer[]
  enemies: SnapEnemy[]
  bolts: SnapBolt[]
  events: GameEvent[]
}

export interface LobbyMember {
  id: string
  name: string
  color: string
  accessory: string
  rating: number
  ready: boolean
  is_bot: boolean
}

export interface LobbySummary {
  id: string
  name: string
  host: string
  players: number
  max: number
  state: 'waiting' | 'playing'
}

export interface LobbyState extends LobbySummary {
  hostId: string
  members: LobbyMember[]
}

export interface ResultRow {
  id: string
  name: string
  is_bot: boolean
  score: number
  kills: number
  deaths: number
  place: number
  ratingBefore: number
  ratingAfter: number
  delta: number
}

export type ServerMessage =
  | { t: 'welcome'; id: string; name: string; token: string | null; rating: number; rank: number | null }
  | { t: 'error'; code: string; message: string }
  | { t: 'pong'; ts: number }
  | { t: 'lobbies'; lobbies: LobbySummary[] }
  | ({ t: 'lobby' } & LobbyState)
  | { t: 'lobby_left' }
  | { t: 'queue_status'; inQueue: number; waited: number; botsIn: number }
  | { t: 'queue_left' }
  | { t: 'match_start'; matchId: string; mode: 'ranked' | 'casual'; you: string; roster: RosterEntry[] }
  | ({ t: 'snap' } & Snapshot)
  | { t: 'match_end'; matchId: string; mode: string; results: ResultRow[]; replayId: string }
  | { t: 'left_match' }

export interface ReplayFile {
  header: { version: number; matchId: string; mode: string; roster: RosterEntry[]; tickRate: number }
  frames: Snapshot[]
}

export interface LeaderboardRow {
  rank: number
  id: string
  name: string
  rating: number
}

export interface MatchSummary {
  id: string
  mode: string
  endedAt: string
  duration: number
  players: { name: string; isBot: boolean; place: number; score: number; kills: number }[]
}
