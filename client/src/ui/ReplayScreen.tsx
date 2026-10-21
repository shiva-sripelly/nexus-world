import { useEffect, useMemo, useState } from 'react'
import { TICK_RATE } from '../game/constants'
import { ReplayPlayer } from '../game/replayPlayer'
import { feedFromEvents, actions, useGame, type FeedItem, type HudPlayer } from '../game/store'
import type { ReplayFile } from '../net/protocol'
import type { SceneSource } from '../scene/Entities'
import { GameScene } from '../scene/GameScene'
import { formatTime } from './common'
import { KillFeed, Scoreboard } from './hudParts'

const SPEEDS = [0.5, 1, 2, 4]

export function ReplayScreen() {
  const replayId = useGame((s) => s.replayId)
  const [player, setPlayer] = useState<ReplayPlayer | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!replayId) return
    let cancelled = false
    fetch(`/api/replays/${replayId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: ReplayFile) => !cancelled && setPlayer(new ReplayPlayer(data)))
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
    }
  }, [replayId])

  if (failed)
    return (
      <main className="center-screen">
        <div className="panel">
          <p className="empty">Replay not found.</p>
          <button className="btn" onClick={() => actions.goto('replays')}>
            Back
          </button>
        </div>
      </main>
    )
  if (!player) return <main className="center-screen"><p className="empty">Loading replay…</p></main>
  return <ReplayView player={player} />
}

function ReplayView({ player }: { player: ReplayPlayer }) {
  const [feed, setFeed] = useState<FeedItem[]>([])
  const [, force] = useState(0)

  const source = useMemo<SceneSource>(() => {
    let pending: FeedItem[] = []
    const src: SceneSource & { drain: () => FeedItem[] } = {
      view: player.view,
      roster: player.roster,
      live: false,
      update: (dt) => {
        const { events } = player.update(dt)
        if (events.length) pending = pending.concat(feedFromEvents(events, player.roster))
      },
      drain: () => {
        const out = pending
        pending = []
        return out
      },
    }
    return src
  }, [player])

  useEffect(() => {
    const id = window.setInterval(() => {
      const items = (source as SceneSource & { drain: () => FeedItem[] }).drain()
      const now = performance.now()
      setFeed((f) => [...f, ...items].filter((x) => now - x.at < 5000).slice(-5))
      force((n) => n + 1)
    }, 150)
    return () => window.clearInterval(id)
  }, [source])

  const standings: HudPlayer[] = [...player.view.players.values()]
    .map((v) => {
      const r = player.roster.get(v.id)
      return {
        id: v.id,
        name: r?.name ?? '?',
        color: r?.color ?? '#fff',
        isBot: r?.is_bot ?? false,
        score: v.score,
        kills: v.kills,
        deaths: v.deaths,
        hp: v.hp,
        alive: v.alive,
        connected: v.connected,
      }
    })
    .sort((a, b) => b.score - a.score || b.kills - a.kills)

  const elapsed = (player.clock - player.firstTick) / TICK_RATE
  const total = (player.lastTick - player.firstTick) / TICK_RATE

  return (
    <div className="game">
      <GameScene source={source} />
      <div className="hud">
        <div className="hud__top">
          <Scoreboard standings={standings} you={player.view.focusId} />
          <div className="hud__timer">
            <span className="badge">Replay</span>
          </div>
          <div className="hud__net">
            <button className="btn btn--ghost btn--small" onClick={() => actions.goto('replays')}>
              Exit replay
            </button>
          </div>
        </div>
        <KillFeed items={feed} />
        <div className="replay-bar">
          <button
            className="btn btn--small"
            onClick={() => {
              if (player.progress >= 1) player.seek(0)
              player.playing = !player.playing
            }}
          >
            {player.playing ? 'Pause' : 'Play'}
          </button>
          <span className="replay-bar__time">
            {formatTime(elapsed)} / {formatTime(total)}
          </span>
          <label className="sr-only" htmlFor="replay-seek">
            Seek
          </label>
          <input
            id="replay-seek"
            type="range"
            min={0}
            max={1000}
            value={Math.round(player.progress * 1000)}
            onChange={(e) => player.seek(Number(e.target.value) / 1000)}
          />
          <div className="chips">
            {SPEEDS.map((s) => (
              <button key={s} className={player.speed === s ? 'chip chip--on' : 'chip'} onClick={() => (player.speed = s)}>
                {s}×
              </button>
            ))}
          </div>
          <label className="replay-bar__follow">
            Follow
            <select value={player.view.focusId ?? ''} onChange={(e) => (player.view.focusId = e.target.value)}>
              {[...player.roster.values()].map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </div>
  )
}
